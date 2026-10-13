// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgenticProofRegistry {
    struct Agent {
        bytes32 agentId;
        address agent;
        address owner;
        bytes32 metadataHash;
        bool active;
    }

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

    struct OutcomeAttestation {
        bytes32 actionId;
        bytes32 resultHash;
        bytes32 status;
        address attestor;
        uint64 attestedAt;
    }

    error InvalidAgentId();
    error AgentAlreadyRegistered();
    error AgentNotRegistered();
    error AgentInactive();
    error NotAgentOwner();
    error InvalidTimeWindow();
    error AuthorizationNonceUsed();
    error AuthorizationNotFound();
    error NotAuthorizationOwner();
    error AuthorizationAlreadyRevoked();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error WrongAgent();
    error WrongActionType();
    error WrongScope();
    error ValueExceedsAuthorization();
    error ActionAlreadyRecorded();
    error InvalidActionId();
    error InvalidActionHash();
    error SingleUseAuthorizationConsumed();
    error ActionNotFound();
    error AttestorNotConfigured();
    error WrongAttestor();
    error AttestationAlreadyRecorded();
    error InvalidResultHash();

    mapping(bytes32 => Agent) private agents;
    mapping(address => bytes32) public agentIdByAddress;
    mapping(bytes32 => Authorization) private authorizations;
    mapping(bytes32 => ActionProof) private actions;
    mapping(bytes32 => OutcomeAttestation) private attestations;
    mapping(address => mapping(uint256 => bool)) public authorizationNonceUsed;

    event AgentRegistered(bytes32 indexed agentId, address indexed agent, address indexed owner, bytes32 metadataHash);
    event AgentStatusChanged(bytes32 indexed agentId, bool active);
    event AuthorizationGranted(
        bytes32 indexed authorizationId,
        address indexed user,
        address indexed agent,
        bytes32 actionType,
        bytes32 scopeHash,
        uint256 maxValue,
        uint64 validAfter,
        uint64 validUntil,
        uint256 nonce,
        address attestor,
        bool singleUse
    );
    event AuthorizationRevoked(bytes32 indexed authorizationId, uint64 revokedAt);
    event ActionRecorded(
        bytes32 indexed actionId,
        bytes32 indexed authorizationId,
        address indexed agent,
        bytes32 actionType,
        bytes32 scopeHash,
        bytes32 actionHash,
        bytes32 traceRoot,
        uint256 value,
        uint64 recordedAt
    );
    event OutcomeAttested(
        bytes32 indexed actionId,
        address indexed attestor,
        bytes32 resultHash,
        bytes32 status,
        uint64 attestedAt
    );

    function registerAgent(bytes32 agentId, bytes32 metadataHash) external {
        if (agentId == bytes32(0)) revert InvalidAgentId();
        if (agentIdByAddress[msg.sender] != bytes32(0) || agents[agentId].agent != address(0)) {
            revert AgentAlreadyRegistered();
        }

        agents[agentId] = Agent({
            agentId: agentId,
            agent: msg.sender,
            owner: msg.sender,
            metadataHash: metadataHash,
            active: true
        });
        agentIdByAddress[msg.sender] = agentId;

        emit AgentRegistered(agentId, msg.sender, msg.sender, metadataHash);
    }

    function setAgentActive(bytes32 agentId, bool active) external {
        Agent storage record = agents[agentId];
        if (record.agent == address(0)) revert AgentNotRegistered();
        if (record.owner != msg.sender) revert NotAgentOwner();
        record.active = active;
        emit AgentStatusChanged(agentId, active);
    }

    function grantAuthorization(
        address agent,
        bytes32 actionType,
        bytes32 scopeHash,
        uint256 maxValue,
        uint64 validAfter,
        uint64 validUntil,
        uint256 nonce,
        address attestor,
        bool singleUse
    ) external returns (bytes32 authorizationId) {
        bytes32 agentId = agentIdByAddress[agent];
        if (agentId == bytes32(0)) revert AgentNotRegistered();
        if (!agents[agentId].active) revert AgentInactive();
        if (validUntil <= validAfter || validUntil <= block.timestamp) revert InvalidTimeWindow();
        if (authorizationNonceUsed[msg.sender][nonce]) revert AuthorizationNonceUsed();

        authorizationId = keccak256(
            abi.encode(
                msg.sender,
                agent,
                actionType,
                scopeHash,
                maxValue,
                validAfter,
                validUntil,
                nonce,
                attestor,
                singleUse,
                block.chainid,
                address(this)
            )
        );
        authorizationNonceUsed[msg.sender][nonce] = true;

        authorizations[authorizationId] = Authorization({
            authorizationId: authorizationId,
            user: msg.sender,
            agent: agent,
            actionType: actionType,
            scopeHash: scopeHash,
            maxValue: maxValue,
            validAfter: validAfter,
            validUntil: validUntil,
            nonce: nonce,
            revoked: false,
            revokedAt: 0,
            attestor: attestor,
            singleUse: singleUse,
            actionCount: 0
        });

        emit AuthorizationGranted(
            authorizationId,
            msg.sender,
            agent,
            actionType,
            scopeHash,
            maxValue,
            validAfter,
            validUntil,
            nonce,
            attestor,
            singleUse
        );
    }

    function revokeAuthorization(bytes32 authorizationId) external {
        Authorization storage auth = authorizations[authorizationId];
        if (auth.user == address(0)) revert AuthorizationNotFound();
        if (auth.user != msg.sender) revert NotAuthorizationOwner();
        if (auth.revoked) revert AuthorizationAlreadyRevoked();

        auth.revoked = true;
        auth.revokedAt = uint64(block.timestamp);
        emit AuthorizationRevoked(authorizationId, auth.revokedAt);
    }

    function recordAction(
        bytes32 authorizationId,
        bytes32 actionId,
        bytes32 actionType,
        bytes32 scopeHash,
        bytes32 actionHash,
        bytes32 traceRoot,
        uint256 value
    ) external {
        if (actionId == bytes32(0)) revert InvalidActionId();
        if (actionHash == bytes32(0)) revert InvalidActionHash();
        if (actions[actionId].agent != address(0)) revert ActionAlreadyRecorded();

        Authorization storage auth = authorizations[authorizationId];
        if (auth.user == address(0)) revert AuthorizationNotFound();
        if (auth.agent != msg.sender) revert WrongAgent();

        bytes32 agentId = agentIdByAddress[msg.sender];
        if (agentId == bytes32(0)) revert AgentNotRegistered();
        if (!agents[agentId].active) revert AgentInactive();
        if (auth.revoked) revert AuthorizationAlreadyRevoked();
        if (block.timestamp < auth.validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp > auth.validUntil) revert AuthorizationExpired();
        if (auth.actionType != actionType) revert WrongActionType();
        if (auth.scopeHash != scopeHash) revert WrongScope();
        if (value > auth.maxValue) revert ValueExceedsAuthorization();
        if (auth.singleUse && auth.actionCount > 0) revert SingleUseAuthorizationConsumed();

        uint64 recordedAt = uint64(block.timestamp);
        actions[actionId] = ActionProof({
            actionId: actionId,
            authorizationId: authorizationId,
            actionType: actionType,
            scopeHash: scopeHash,
            actionHash: actionHash,
            traceRoot: traceRoot,
            value: value,
            recordedAt: recordedAt,
            agent: msg.sender
        });
        auth.actionCount += 1;

        emit ActionRecorded(
            actionId,
            authorizationId,
            msg.sender,
            actionType,
            scopeHash,
            actionHash,
            traceRoot,
            value,
            recordedAt
        );
    }

    function attestOutcome(bytes32 actionId, bytes32 resultHash, bytes32 status) external {
        ActionProof storage action = actions[actionId];
        if (action.agent == address(0)) revert ActionNotFound();
        Authorization storage auth = authorizations[action.authorizationId];
        if (auth.attestor == address(0)) revert AttestorNotConfigured();
        if (msg.sender != auth.attestor) revert WrongAttestor();
        if (attestations[actionId].attestor != address(0)) revert AttestationAlreadyRecorded();
        if (resultHash == bytes32(0)) revert InvalidResultHash();

        uint64 attestedAt = uint64(block.timestamp);
        attestations[actionId] = OutcomeAttestation({
            actionId: actionId,
            resultHash: resultHash,
            status: status,
            attestor: msg.sender,
            attestedAt: attestedAt
        });

        emit OutcomeAttested(actionId, msg.sender, resultHash, status, attestedAt);
    }

    function getAgent(bytes32 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getAuthorization(bytes32 authorizationId) external view returns (Authorization memory) {
        return authorizations[authorizationId];
    }

    function getAction(bytes32 actionId) external view returns (ActionProof memory) {
        return actions[actionId];
    }

    function getAttestation(bytes32 actionId) external view returns (OutcomeAttestation memory) {
        return attestations[actionId];
    }

    function verifyAction(bytes32 actionId)
        external
        view
        returns (
            bool existsOnchain,
            bool authorizationValidAtActionTime,
            bool authorizationCurrentlyActive,
            bool attested
        )
    {
        ActionProof storage action = actions[actionId];
        if (action.agent == address(0)) return (false, false, false, false);

        Authorization storage auth = authorizations[action.authorizationId];
        existsOnchain = true;
        authorizationValidAtActionTime =
            action.recordedAt >= auth.validAfter &&
            action.recordedAt <= auth.validUntil &&
            (auth.revokedAt == 0 || action.recordedAt < auth.revokedAt) &&
            action.agent == auth.agent &&
            action.actionType == auth.actionType &&
            action.scopeHash == auth.scopeHash &&
            action.value <= auth.maxValue;

        bytes32 agentId = agentIdByAddress[auth.agent];
        authorizationCurrentlyActive =
            !auth.revoked &&
            block.timestamp >= auth.validAfter &&
            block.timestamp <= auth.validUntil &&
            agentId != bytes32(0) &&
            agents[agentId].active;

        attested = attestations[actionId].attestor != address(0);
    }
}
