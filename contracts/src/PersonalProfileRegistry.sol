// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgenticProofProfileSource {
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

    struct ActionProof {
        bytes32 actionId;
        bytes32 authorizationId;
        bytes32 actionType;
        bytes32 scopeHash;
        bytes32 actionHash;
        bytes32 traceRoot;
        uint256 value;
        uint64 recordedAt;
        address agent;
    }

    function getAuthorization(bytes32 authorizationId) external view returns (Authorization memory);
    function getAction(bytes32 actionId) external view returns (ActionProof memory);
}

/// @notice Wallet-owned personal profile commitments plus privacy-preserving payment receipt links.
/// @dev No plaintext PII, encryption key, invoice or itinerary is stored onchain.
contract PersonalProfileRegistry {
    bytes32 public constant PAY_SERVICE = keccak256(bytes("PAY_SERVICE"));
    bytes32 public constant PROFILE_DOMAIN = keccak256(bytes("APP_PERSONAL_PROFILE_V1"));
    bytes32 public constant PROFILE_SCOPE_DOMAIN = keccak256(bytes("APP_PROFILE_SCOPE_V1"));
    bytes32 public constant RECEIPT_DOMAIN = keccak256(bytes("APP_PRIVATE_PAYMENT_RECEIPT_V1"));

    IAgenticProofProfileSource public immutable appRegistry;

    struct Profile {
        address owner;
        bytes32 profileHash;
        bytes32 policyHash;
        bytes32 encryptionKeyCommitment;
        uint64 version;
        uint64 updatedAt;
        bool active;
        uint64 paymentCount;
        uint256 totalRecordedValue;
    }

    struct PaymentReceipt {
        bytes32 receiptId;
        address user;
        bytes32 actionId;
        bytes32 authorizationId;
        bytes32 encryptedPayloadHash;
        bytes32 profileHash;
        bytes32 policyHash;
        uint256 value;
        uint64 linkedAt;
    }

    mapping(address => Profile) private profiles;
    mapping(bytes32 => PaymentReceipt) private receipts;
    mapping(bytes32 => bytes32) public receiptIdByAction;

    error ZeroAddress();
    error InvalidCommitment();
    error ProfileNotFound();
    error ProfileInactive();
    error ActionNotFound();
    error WrongProfileOwner();
    error ProfileScopeMismatch();
    error NotPaymentAction();
    error ReceiptAlreadyLinked();

    event ProfileUpdated(
        address indexed user,
        bytes32 indexed profileHash,
        bytes32 policyHash,
        bytes32 encryptionKeyCommitment,
        uint64 version,
        bool active
    );
    event ProfileStatusChanged(address indexed user, bool active, uint64 version);
    event PrivatePaymentReceiptLinked(
        bytes32 indexed receiptId,
        bytes32 indexed actionId,
        address indexed user,
        bytes32 authorizationId,
        bytes32 encryptedPayloadHash,
        bytes32 profileHash,
        bytes32 policyHash,
        uint256 value,
        uint64 linkedAt
    );

    constructor(address appRegistry_) {
        if (appRegistry_ == address(0)) revert ZeroAddress();
        appRegistry = IAgenticProofProfileSource(appRegistry_);
    }

    function profileId(address user) public view returns (bytes32) {
        return keccak256(abi.encode(PROFILE_DOMAIN, block.chainid, address(this), user));
    }

    function profileBoundScopeHash(bytes32 profileHash, bytes32 actionScopeHash) public pure returns (bytes32) {
        return keccak256(abi.encode(PROFILE_SCOPE_DOMAIN, profileHash, actionScopeHash));
    }

    function upsertProfile(bytes32 profileHash, bytes32 policyHash, bytes32 encryptionKeyCommitment) external {
        if (profileHash == bytes32(0) || policyHash == bytes32(0) || encryptionKeyCommitment == bytes32(0)) {
            revert InvalidCommitment();
        }

        Profile storage profile = profiles[msg.sender];
        uint64 nextVersion = profile.version + 1;
        profile.owner = msg.sender;
        profile.profileHash = profileHash;
        profile.policyHash = policyHash;
        profile.encryptionKeyCommitment = encryptionKeyCommitment;
        profile.version = nextVersion;
        profile.updatedAt = uint64(block.timestamp);
        profile.active = true;

        emit ProfileUpdated(
            msg.sender,
            profileHash,
            policyHash,
            encryptionKeyCommitment,
            nextVersion,
            true
        );
    }

    function setProfileActive(bool active) external {
        Profile storage profile = profiles[msg.sender];
        if (profile.owner == address(0)) revert ProfileNotFound();
        profile.active = active;
        profile.updatedAt = uint64(block.timestamp);
        emit ProfileStatusChanged(msg.sender, active, profile.version);
    }

    function linkPrivatePaymentReceipt(bytes32 actionId, bytes32 encryptedPayloadHash, bytes32 baseActionScopeHash)
        external
        returns (bytes32 receiptId)
    {
        if (encryptedPayloadHash == bytes32(0)) revert InvalidCommitment();
        Profile storage profile = profiles[msg.sender];
        if (profile.owner == address(0)) revert ProfileNotFound();
        if (!profile.active) revert ProfileInactive();
        if (receiptIdByAction[actionId] != bytes32(0)) revert ReceiptAlreadyLinked();

        IAgenticProofProfileSource.ActionProof memory action = appRegistry.getAction(actionId);
        if (action.agent == address(0)) revert ActionNotFound();
        if (action.actionType != PAY_SERVICE) revert NotPaymentAction();
        if (action.scopeHash != profileBoundScopeHash(profile.profileHash, baseActionScopeHash)) {
            revert ProfileScopeMismatch();
        }

        IAgenticProofProfileSource.Authorization memory auth = appRegistry.getAuthorization(action.authorizationId);
        if (auth.user != msg.sender) revert WrongProfileOwner();

        receiptId = keccak256(
            abi.encode(
                RECEIPT_DOMAIN,
                block.chainid,
                address(this),
                msg.sender,
                actionId,
                action.authorizationId,
                encryptedPayloadHash,
                profile.profileHash,
                profile.policyHash
            )
        );

        uint64 linkedAt = uint64(block.timestamp);
        receipts[receiptId] = PaymentReceipt({
            receiptId: receiptId,
            user: msg.sender,
            actionId: actionId,
            authorizationId: action.authorizationId,
            encryptedPayloadHash: encryptedPayloadHash,
            profileHash: profile.profileHash,
            policyHash: profile.policyHash,
            value: action.value,
            linkedAt: linkedAt
        });
        receiptIdByAction[actionId] = receiptId;
        profile.paymentCount += 1;
        profile.totalRecordedValue += action.value;

        emit PrivatePaymentReceiptLinked(
            receiptId,
            actionId,
            msg.sender,
            action.authorizationId,
            encryptedPayloadHash,
            profile.profileHash,
            profile.policyHash,
            action.value,
            linkedAt
        );
    }

    function getProfile(address user) external view returns (Profile memory) {
        return profiles[user];
    }

    function getPaymentReceipt(bytes32 receiptId) external view returns (PaymentReceipt memory) {
        return receipts[receiptId];
    }
}
