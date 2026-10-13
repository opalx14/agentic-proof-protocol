// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgenticProofRegistry {
    struct Authorization {
        bytes32 authorizationId;
        address user;
        address agent;
        bytes32 actionType;
        bytes32 scopeHash;
        uint256 maxValue;
        uint64 validAfter;
        uint64 validUntil;
        uint256 nonce;
        bool revoked;
        uint64 revokedAt;
        address attestor;
        bool singleUse;
        uint64 actionCount;
    }

    function registerAgent(bytes32 agentId, bytes32 metadataHash) external;
    function setAgentActive(bytes32 agentId, bool active) external;
    function getAuthorization(bytes32 authorizationId) external view returns (Authorization memory);
    function recordAction(
        bytes32 authorizationId,
        bytes32 actionId,
        bytes32 actionType,
        bytes32 scopeHash,
        bytes32 actionHash,
        bytes32 traceRoot,
        uint256 value
    ) external;
}

/// @notice Minimal smart spending account for AI-agent payments.
/// @dev The vault itself is the registered onchain agent. It can only move funds when
///      the owner's APP authorization exactly matches PAY_SERVICE + spending scope.
contract AgenticSpendingVault {
    bytes32 public constant PAY_SERVICE = keccak256(bytes("PAY_SERVICE"));
    bytes32 public constant SCOPE_DOMAIN = keccak256(bytes("APP_SPENDING_SCOPE_V1"));
    bytes32 public constant PROFILE_SCOPE_DOMAIN = keccak256(bytes("APP_PROFILE_SCOPE_V1"));
    bytes32 public constant ACTION_DOMAIN = keccak256(bytes("APP_SPENDING_ACTION_V1"));

    address public immutable owner;
    IAgenticProofRegistry public immutable registry;
    bytes32 public immutable agentId;
    address public executor;

    struct PaymentExecution {
        address token;
        address payable recipient;
        uint256 amount;
        bytes32 resourceHash;
        uint256 paymentNonce;
        bytes32 scopeHash;
        bytes32 actionId;
        bytes32 actionHash;
    }

    bool private entered;
    mapping(bytes32 => bool) public paymentExecuted;
    mapping(bytes32 => uint256) public authorizationSpent;

    error NotOwner();
    error NotExecutor();
    error ZeroAddress();
    error InvalidAgentId();
    error InvalidProfileHash();
    error InvalidAuthorization();
    error AuthorizationOwnerMismatch();
    error AuthorizationAgentMismatch();
    error AuthorizationActionMismatch();
    error AuthorizationScopeMismatch();
    error AuthorizationRevoked();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AmountExceedsAuthorization();
    error CumulativeBudgetExceeded();
    error PaymentAlreadyExecuted();
    error InsufficientNativeBalance();
    error NativeTransferFailed();
    error TokenTransferFailed();
    error Reentrancy();

    event NativeDeposited(address indexed from, uint256 amount);
    event ExecutorChanged(address indexed previousExecutor, address indexed newExecutor);
    event AuthorizedPaymentExecuted(
        bytes32 indexed actionId,
        bytes32 indexed authorizationId,
        address indexed recipient,
        address token,
        uint256 amount,
        bytes32 resourceHash,
        uint256 paymentNonce,
        bytes32 actionHash
    );
    event EmergencyWithdrawal(address indexed token, address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyExecutor() {
        if (msg.sender != owner && msg.sender != executor) revert NotExecutor();
        _;
    }

    modifier nonReentrant() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }

    constructor(address registry_, bytes32 agentId_, bytes32 metadataHash_) {
        if (registry_ == address(0)) revert ZeroAddress();
        if (agentId_ == bytes32(0)) revert InvalidAgentId();
        owner = msg.sender;
        executor = msg.sender;
        registry = IAgenticProofRegistry(registry_);
        agentId = agentId_;
        registry.registerAgent(agentId_, metadataHash_);
    }

    receive() external payable {
        emit NativeDeposited(msg.sender, msg.value);
    }

    function depositNative() external payable {
        emit NativeDeposited(msg.sender, msg.value);
    }

    function setAgentActive(bool active) external onlyOwner {
        registry.setAgentActive(agentId, active);
    }

    function setExecutor(address newExecutor) external onlyOwner {
        if (newExecutor == address(0)) revert ZeroAddress();
        address previous = executor;
        executor = newExecutor;
        emit ExecutorChanged(previous, newExecutor);
    }

    function resourceHash(string calldata resource) public pure returns (bytes32) {
        return keccak256(bytes(resource));
    }

    function spendingScopeHash(address token, address recipient, bytes32 resourceHash_) public view returns (bytes32) {
        return keccak256(abi.encode(SCOPE_DOMAIN, block.chainid, token, recipient, resourceHash_));
    }

    function profileBoundScopeHash(bytes32 profileHash, bytes32 actionScopeHash) public pure returns (bytes32) {
        return keccak256(abi.encode(PROFILE_SCOPE_DOMAIN, profileHash, actionScopeHash));
    }

    function paymentActionId(
        bytes32 authorizationId,
        address token,
        address recipient,
        uint256 amount,
        bytes32 resourceHash_,
        uint256 paymentNonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                ACTION_DOMAIN,
                block.chainid,
                address(this),
                authorizationId,
                token,
                recipient,
                amount,
                resourceHash_,
                paymentNonce
            )
        );
    }

    function paymentActionHash(
        bytes32 authorizationId,
        bytes32 actionId,
        address token,
        address recipient,
        uint256 amount,
        bytes32 resourceHash_,
        uint256 paymentNonce
    ) public view returns (bytes32) {
        return sha256(
            abi.encode(
                ACTION_DOMAIN,
                block.chainid,
                address(this),
                authorizationId,
                actionId,
                token,
                recipient,
                amount,
                resourceHash_,
                paymentNonce
            )
        );
    }

    function executeAuthorizedPayment(
        bytes32 authorizationId,
        address token,
        address payable recipient,
        uint256 amount,
        string calldata resource,
        uint256 paymentNonce,
        bytes32 traceRoot
    ) external onlyExecutor nonReentrant returns (bytes32 actionId, bytes32 actionHash) {
        PaymentExecution memory payment = _buildPayment(token, recipient, amount, resource, paymentNonce);
        return _executePreparedPayment(authorizationId, traceRoot, payment);
    }

    function executeProfileAuthorizedPayment(
        bytes32 authorizationId,
        bytes32 profileHash,
        address token,
        address payable recipient,
        uint256 amount,
        string calldata resource,
        uint256 paymentNonce,
        bytes32 traceRoot
    ) external onlyExecutor nonReentrant returns (bytes32 actionId, bytes32 actionHash) {
        if (profileHash == bytes32(0)) revert InvalidProfileHash();
        PaymentExecution memory payment = _buildPayment(token, recipient, amount, resource, paymentNonce);
        payment.scopeHash = profileBoundScopeHash(profileHash, payment.scopeHash);
        return _executePreparedPayment(authorizationId, traceRoot, payment);
    }

    function _buildPayment(
        address token,
        address payable recipient,
        uint256 amount,
        string calldata resource,
        uint256 paymentNonce
    ) private view returns (PaymentExecution memory payment) {
        if (recipient == address(0)) revert ZeroAddress();
        payment.token = token;
        payment.recipient = recipient;
        payment.amount = amount;
        payment.resourceHash = resourceHash(resource);
        payment.paymentNonce = paymentNonce;
        payment.scopeHash = spendingScopeHash(token, recipient, payment.resourceHash);
    }

    function _executePreparedPayment(
        bytes32 authorizationId,
        bytes32 traceRoot,
        PaymentExecution memory payment
    ) private returns (bytes32 actionId, bytes32 actionHash) {
        _validateAuthorization(authorizationId, payment.scopeHash, payment.amount);

        payment.actionId = paymentActionId(
            authorizationId,
            payment.token,
            payment.recipient,
            payment.amount,
            payment.resourceHash,
            payment.paymentNonce
        );
        if (paymentExecuted[payment.actionId]) revert PaymentAlreadyExecuted();

        payment.actionHash = paymentActionHash(
            authorizationId,
            payment.actionId,
            payment.token,
            payment.recipient,
            payment.amount,
            payment.resourceHash,
            payment.paymentNonce
        );

        paymentExecuted[payment.actionId] = true;
        authorizationSpent[authorizationId] += payment.amount;
        _recordAndTransfer(authorizationId, traceRoot, payment);

        return (payment.actionId, payment.actionHash);
    }

    function _validateAuthorization(bytes32 authorizationId, bytes32 scopeHash, uint256 amount) private view {
        IAgenticProofRegistry.Authorization memory auth = registry.getAuthorization(authorizationId);
        if (auth.user == address(0)) revert InvalidAuthorization();
        if (auth.user != owner) revert AuthorizationOwnerMismatch();
        if (auth.agent != address(this)) revert AuthorizationAgentMismatch();
        if (auth.actionType != PAY_SERVICE) revert AuthorizationActionMismatch();
        if (auth.revoked) revert AuthorizationRevoked();
        if (block.timestamp < auth.validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp > auth.validUntil) revert AuthorizationExpired();
        if (amount > auth.maxValue) revert AmountExceedsAuthorization();
        uint256 spent = authorizationSpent[authorizationId];
        if (spent > auth.maxValue - amount) revert CumulativeBudgetExceeded();
        if (auth.scopeHash != scopeHash) revert AuthorizationScopeMismatch();
    }

    function _recordAndTransfer(bytes32 authorizationId, bytes32 traceRoot, PaymentExecution memory payment) private {
        registry.recordAction(
            authorizationId,
            payment.actionId,
            PAY_SERVICE,
            payment.scopeHash,
            payment.actionHash,
            traceRoot,
            payment.amount
        );

        if (payment.token == address(0)) {
            if (address(this).balance < payment.amount) revert InsufficientNativeBalance();
            (bool sent,) = payment.recipient.call{value: payment.amount}("");
            if (!sent) revert NativeTransferFailed();
        } else {
            (bool success, bytes memory data) = payment.token.call(
                abi.encodeWithSignature("transfer(address,uint256)", payment.recipient, payment.amount)
            );
            if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
        }

        emit AuthorizedPaymentExecuted(
            payment.actionId,
            authorizationId,
            payment.recipient,
            payment.token,
            payment.amount,
            payment.resourceHash,
            payment.paymentNonce,
            payment.actionHash
        );
    }

    function emergencyWithdrawNative(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (address(this).balance < amount) revert InsufficientNativeBalance();
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert NativeTransferFailed();
        emit EmergencyWithdrawal(address(0), recipient, amount);
    }

    function emergencyWithdrawToken(address token, address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", recipient, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
        emit EmergencyWithdrawal(token, recipient, amount);
    }
}
