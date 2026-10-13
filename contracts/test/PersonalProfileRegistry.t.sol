// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticProofRegistry} from "../src/AgenticProofRegistry.sol";
import {PersonalProfileRegistry} from "../src/PersonalProfileRegistry.sol";

contract ProfileActionAgent {
    AgenticProofRegistry private immutable registry;

    constructor(AgenticProofRegistry registry_) {
        registry = registry_;
        registry.registerAgent(keccak256("profile-action-agent"), keccak256("profile-action-agent:v1"));
    }

    function record(
        bytes32 authorizationId,
        bytes32 actionId,
        bytes32 actionType,
        bytes32 scopeHash,
        bytes32 actionHash,
        uint256 value
    ) external {
        registry.recordAction(
            authorizationId,
            actionId,
            actionType,
            scopeHash,
            actionHash,
            keccak256("profile-trace"),
            value
        );
    }
}

contract ProfileAttacker {
    function createProfile(PersonalProfileRegistry profiles) external {
        profiles.upsertProfile(
            keccak256("attacker-profile"),
            keccak256("attacker-policy"),
            keccak256("attacker-key")
        );
    }

    function link(
        PersonalProfileRegistry profiles,
        bytes32 actionId,
        bytes32 encryptedPayloadHash,
        bytes32 baseActionScopeHash
    ) external returns (bool ok) {
        (ok,) = address(profiles).call(
            abi.encodeCall(
                PersonalProfileRegistry.linkPrivatePaymentReceipt,
                (actionId, encryptedPayloadHash, baseActionScopeHash)
            )
        );
    }
}

contract PersonalProfileRegistryTest {
    AgenticProofRegistry private registry;
    PersonalProfileRegistry private profiles;
    ProfileActionAgent private agent;

    bytes32 private constant PAY_SERVICE = keccak256(bytes("PAY_SERVICE"));
    bytes32 private constant BOOK_TRAVEL = keccak256(bytes("BOOK_TRAVEL"));
    bytes32 private constant SCOPE = keccak256("merchant:demo-airline");
    bytes32 private constant PROFILE_HASH = keccak256("profile:v1");
    bytes32 private constant POLICY_HASH = keccak256("policy:v1");
    bytes32 private constant KEY_COMMITMENT = keccak256("key:v1");
    bytes32 private constant ENCRYPTED_RECEIPT_HASH = keccak256("ciphertext:pay-361");

    function setUp() public {
        registry = new AgenticProofRegistry();
        profiles = new PersonalProfileRegistry(address(registry));
        agent = new ProfileActionAgent(registry);
    }

    function _grantAndRecord(bytes32 actionType, bytes32 actionId, uint256 nonce, uint256 value)
        internal
        returns (bytes32 authorizationId)
    {
        bytes32 profileBoundScope = profiles.profileBoundScopeHash(PROFILE_HASH, SCOPE);
        authorizationId = registry.grantAuthorization(
            address(agent),
            actionType,
            profileBoundScope,
            400_000_000,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            nonce,
            address(0),
            false
        );
        agent.record(
            authorizationId,
            actionId,
            actionType,
            profileBoundScope,
            sha256(abi.encodePacked("private-payment", actionId)),
            value
        );
    }

    function _createProfile() internal {
        profiles.upsertProfile(PROFILE_HASH, POLICY_HASH, KEY_COMMITMENT);
    }

    function testOwnerCreatesAndUpdatesProfileCommitments() public {
        _createProfile();
        PersonalProfileRegistry.Profile memory first = profiles.getProfile(address(this));
        require(first.owner == address(this), "wrong owner");
        require(first.profileHash == PROFILE_HASH, "wrong profile hash");
        require(first.policyHash == POLICY_HASH, "wrong policy hash");
        require(first.encryptionKeyCommitment == KEY_COMMITMENT, "wrong key commitment");
        require(first.version == 1, "wrong version");
        require(first.active, "profile inactive");

        bytes32 nextProfileHash = keccak256("profile:v2");
        profiles.upsertProfile(nextProfileHash, POLICY_HASH, KEY_COMMITMENT);
        PersonalProfileRegistry.Profile memory second = profiles.getProfile(address(this));
        require(second.profileHash == nextProfileHash, "update failed");
        require(second.version == 2, "version not incremented");
        require(second.paymentCount == 0, "unexpected payment count");
    }

    function testPrivatePaymentReceiptLinksExistingPaymentProof() public {
        _createProfile();
        bytes32 actionId = keccak256("payment-action-361");
        bytes32 authorizationId = _grantAndRecord(PAY_SERVICE, actionId, 1, 361_000_000);

        bytes32 receiptId = profiles.linkPrivatePaymentReceipt(actionId, ENCRYPTED_RECEIPT_HASH, SCOPE);
        PersonalProfileRegistry.PaymentReceipt memory receipt = profiles.getPaymentReceipt(receiptId);
        PersonalProfileRegistry.Profile memory profile = profiles.getProfile(address(this));

        require(receipt.user == address(this), "wrong receipt user");
        require(receipt.actionId == actionId, "wrong action id");
        require(receipt.authorizationId == authorizationId, "wrong authorization id");
        require(receipt.encryptedPayloadHash == ENCRYPTED_RECEIPT_HASH, "wrong ciphertext commitment");
        require(receipt.profileHash == PROFILE_HASH, "wrong profile snapshot");
        require(receipt.policyHash == POLICY_HASH, "wrong policy snapshot");
        require(receipt.value == 361_000_000, "wrong value");
        require(profile.paymentCount == 1, "payment count not tracked");
        require(profile.totalRecordedValue == 361_000_000, "aggregate value not tracked");
    }

    function testDifferentWalletCannotAttachAnotherUsersPayment() public {
        _createProfile();
        bytes32 actionId = keccak256("payment-action-owner");
        _grantAndRecord(PAY_SERVICE, actionId, 2, 100);

        ProfileAttacker attacker = new ProfileAttacker();
        attacker.createProfile(profiles);
        bool ok = attacker.link(profiles, actionId, keccak256("attacker-ciphertext"), SCOPE);
        require(!ok, "wrong user linked payment");
    }

    function testNonPaymentActionCannotBeAddedToPrivatePaymentLedger() public {
        _createProfile();
        bytes32 actionId = keccak256("travel-action");
        _grantAndRecord(BOOK_TRAVEL, actionId, 3, 100);

        (bool ok,) = address(profiles).call(
            abi.encodeCall(
                PersonalProfileRegistry.linkPrivatePaymentReceipt,
                (actionId, ENCRYPTED_RECEIPT_HASH, SCOPE)
            )
        );
        require(!ok, "non-payment action was linked");
    }

    function testDuplicateReceiptRejected() public {
        _createProfile();
        bytes32 actionId = keccak256("payment-action-duplicate");
        _grantAndRecord(PAY_SERVICE, actionId, 4, 100);
        profiles.linkPrivatePaymentReceipt(actionId, ENCRYPTED_RECEIPT_HASH, SCOPE);

        (bool ok,) = address(profiles).call(
            abi.encodeCall(
                PersonalProfileRegistry.linkPrivatePaymentReceipt,
                (actionId, keccak256("different-ciphertext"), SCOPE)
            )
        );
        require(!ok, "duplicate receipt linked");
    }

    function testInactiveProfileRejectsNewReceipt() public {
        _createProfile();
        profiles.setProfileActive(false);
        bytes32 actionId = keccak256("payment-action-inactive");
        _grantAndRecord(PAY_SERVICE, actionId, 5, 100);

        (bool ok,) = address(profiles).call(
            abi.encodeCall(
                PersonalProfileRegistry.linkPrivatePaymentReceipt,
                (actionId, ENCRYPTED_RECEIPT_HASH, SCOPE)
            )
        );
        require(!ok, "inactive profile accepted receipt");
    }

    function testProfileUpdatePreventsOldActionFromLinkingUnderNewProfile() public {
        _createProfile();
        bytes32 actionId = keccak256("payment-action-old-profile");
        _grantAndRecord(PAY_SERVICE, actionId, 6, 100);

        profiles.upsertProfile(keccak256("profile:v2"), POLICY_HASH, KEY_COMMITMENT);
        (bool ok,) = address(profiles).call(
            abi.encodeCall(
                PersonalProfileRegistry.linkPrivatePaymentReceipt,
                (actionId, ENCRYPTED_RECEIPT_HASH, SCOPE)
            )
        );
        require(!ok, "old action linked under new profile version");
    }

    function testProfileBoundScopeVectorMatchesSdk() public view {
        bytes32 profileHash = bytes32(uint256(0x1111111111111111111111111111111111111111111111111111111111111111));
        bytes32 actionScopeHash = bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222));
        require(
            profiles.profileBoundScopeHash(profileHash, actionScopeHash)
                == 0xb3f076a7f172dee349e892654fc75175b457c88748e8fe94fdaa26aa919c8c51,
            "SDK/Solidity profile scope mismatch"
        );
    }

    function testProfileIdIsWalletAndChainBound() public view {
        bytes32 expected = keccak256(
            abi.encode(profiles.PROFILE_DOMAIN(), block.chainid, address(profiles), address(this))
        );
        require(profiles.profileId(address(this)) == expected, "profile id mismatch");
        require(profiles.profileId(address(this)) != profiles.profileId(address(0xB0B)), "profile id not user bound");
    }
}
