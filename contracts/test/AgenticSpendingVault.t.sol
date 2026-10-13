// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticProofRegistry} from "../src/AgenticProofRegistry.sol";
import {AgenticSpendingVault} from "../src/AgenticSpendingVault.sol";

interface SpendingVm {
    function prank(address) external;
}

contract MockToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        uint256 balance = balanceOf[msg.sender];
        require(balance >= amount, "balance");
        unchecked {
            balanceOf[msg.sender] = balance - amount;
            balanceOf[to] += amount;
        }
        return true;
    }
}

contract AgenticSpendingVaultTest {
    SpendingVm private constant vm = SpendingVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    AgenticProofRegistry private registry;
    AgenticSpendingVault private vault;
    MockToken private token;

    address private constant RECIPIENT = address(0xA11CE);
    address private constant OTHER_RECIPIENT = address(0xB0B);
    address private constant OTHER_EXECUTOR = address(0xE11E);
    bytes32 private constant AGENT_ID = keccak256("agentic-spending-vault");
    bytes32 private constant METADATA_HASH = keccak256("agentic-spending-vault:v1");
    bytes32 private constant TRACE_ROOT = keccak256("trace:payment");
    string private constant RESOURCE = "travel:SFO-SIN";

    function setUp() public {
        registry = new AgenticProofRegistry();
        vault = new AgenticSpendingVault(address(registry), AGENT_ID, METADATA_HASH);
        token = new MockToken();
        token.mint(address(vault), 1_000_000_000);
    }

    function _grantPayment(address recipient, uint256 cap, bool singleUse, uint256 nonce)
        internal
        returns (bytes32)
    {
        bytes32 scopeHash = vault.spendingScopeHash(address(token), recipient, keccak256(bytes(RESOURCE)));
        return registry.grantAuthorization(
            address(vault),
            vault.PAY_SERVICE(),
            scopeHash,
            cap,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            nonce,
            address(0),
            singleUse
        );
    }

    function _grantProfilePayment(bytes32 profileHash, uint256 cap, uint256 nonce)
        internal
        returns (bytes32)
    {
        bytes32 baseScope = vault.spendingScopeHash(address(token), RECIPIENT, keccak256(bytes(RESOURCE)));
        bytes32 profileScope = vault.profileBoundScopeHash(profileHash, baseScope);
        return registry.grantAuthorization(
            address(vault),
            vault.PAY_SERVICE(),
            profileScope,
            cap,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            nonce,
            address(0),
            false
        );
    }

    function _execute(
        bytes32 authorizationId,
        address recipient,
        uint256 amount,
        string memory resource,
        uint256 paymentNonce
    ) internal returns (bool ok, bytes memory data) {
        (ok, data) = address(vault).call(
            abi.encodeCall(
                AgenticSpendingVault.executeAuthorizedPayment,
                (
                    authorizationId,
                    address(token),
                    payable(recipient),
                    amount,
                    resource,
                    paymentNonce,
                    TRACE_ROOT
                )
            )
        );
    }

    function testSdkScopeVectorMatchesSolidityOnMonadChainId() public view {
        require(block.chainid == 10143, "unexpected test chain id");
        bytes32 resourceHash = keccak256(bytes(RESOURCE));
        require(
            resourceHash == 0x441b3c927ce49f1533386f1a9be1fd7954657afb140af420a41e3a7f29b6585a,
            "resource vector mismatch"
        );
        bytes32 scopeHash = vault.spendingScopeHash(
            address(0x2222222222222222222222222222222222222222),
            address(0x3333333333333333333333333333333333333333),
            resourceHash
        );
        require(
            scopeHash == 0x38194844d6a4a8d71d7d8a1f73f08d1a06c9dd461fbba1c2f4eb6bd46101daf3,
            "SDK/Solidity scope vector mismatch"
        );
    }

    function testAuthorizedPaymentTransfersAndRecordsProof() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 1);

        uint256 paymentNonce = 77;
        bytes32 resourceHash = keccak256(bytes(RESOURCE));
        bytes32 expectedActionId = vault.paymentActionId(
            authId,
            address(token),
            RECIPIENT,
            361_000_000,
            resourceHash,
            paymentNonce
        );

        (bytes32 actionId, bytes32 actionHash) = vault.executeAuthorizedPayment(
            authId,
            address(token),
            payable(RECIPIENT),
            361_000_000,
            RESOURCE,
            paymentNonce,
            TRACE_ROOT
        );

        require(actionId == expectedActionId, "action id mismatch");
        require(actionHash != bytes32(0), "action hash missing");
        require(token.balanceOf(RECIPIENT) == 361_000_000, "recipient not paid");
        require(vault.paymentExecuted(actionId), "execution flag missing");

        (bool exists, bool validAtActionTime, bool current,) = registry.verifyAction(actionId);
        require(exists, "proof missing");
        require(validAtActionTime, "proof invalid");
        require(current, "authorization should remain active");

        AgenticProofRegistry.ActionProof memory proof = registry.getAction(actionId);
        require(proof.agent == address(vault), "wrong proof agent");
        require(proof.value == 361_000_000, "wrong proof amount");
        require(proof.actionHash == actionHash, "wrong proof commitment");
    }

    function testProfileBoundPaymentTransfersAndRecordsBoundScope() public {
        bytes32 profileHash = keccak256("personal-profile:v1");
        bytes32 authId = _grantProfilePayment(profileHash, 400_000_000, 13);
        (bytes32 actionId,) = vault.executeProfileAuthorizedPayment(
            authId,
            profileHash,
            address(token),
            payable(RECIPIENT),
            361_000_000,
            RESOURCE,
            1,
            TRACE_ROOT
        );

        AgenticProofRegistry.ActionProof memory proof = registry.getAction(actionId);
        bytes32 baseScope = vault.spendingScopeHash(address(token), RECIPIENT, keccak256(bytes(RESOURCE)));
        require(proof.scopeHash == vault.profileBoundScopeHash(profileHash, baseScope), "profile scope not recorded");
        require(token.balanceOf(RECIPIENT) == 361_000_000, "profile payment missing");
    }

    function testWrongProfileHashCannotReuseProfileAuthorization() public {
        bytes32 profileHash = keccak256("personal-profile:v1");
        bytes32 authId = _grantProfilePayment(profileHash, 400_000_000, 14);
        (bool ok,) = address(vault).call(
            abi.encodeCall(
                AgenticSpendingVault.executeProfileAuthorizedPayment,
                (
                    authId,
                    keccak256("personal-profile:evil"),
                    address(token),
                    payable(RECIPIENT),
                    361_000_000,
                    RESOURCE,
                    1,
                    TRACE_ROOT
                )
            )
        );
        require(!ok, "wrong profile hash reused authorization");
        require(token.balanceOf(RECIPIENT) == 0, "wrong profile moved funds");
    }

    function testWrongRecipientCannotReuseAuthorization() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 2);
        (bool ok,) = _execute(authId, OTHER_RECIPIENT, 361_000_000, RESOURCE, 1);
        require(!ok, "wrong recipient must fail");
        require(token.balanceOf(OTHER_RECIPIENT) == 0, "wrong recipient was paid");
    }

    function testOverCapPaymentRejected() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 3);
        (bool ok,) = _execute(authId, RECIPIENT, 401_000_000, RESOURCE, 1);
        require(!ok, "over-cap payment must fail");
        require(token.balanceOf(RECIPIENT) == 0, "over-cap payment escaped");
    }

    function testRevokedAuthorizationCannotSpend() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 4);
        registry.revokeAuthorization(authId);
        (bool ok,) = _execute(authId, RECIPIENT, 361_000_000, RESOURCE, 1);
        require(!ok, "revoked authorization must fail");
        require(token.balanceOf(RECIPIENT) == 0, "revoked payment escaped");
    }

    function testReplayRejectedEvenForMultiUseAuthorization() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 5);
        (bool first,) = _execute(authId, RECIPIENT, 100, RESOURCE, 42);
        require(first, "first payment should succeed");
        (bool replay,) = _execute(authId, RECIPIENT, 100, RESOURCE, 42);
        require(!replay, "replay must fail");
        require(token.balanceOf(RECIPIENT) == 100, "replay moved funds");
    }

    function testCumulativeBudgetRejectsMultiplePaymentsAboveTotalCap() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 10);
        (bool first,) = _execute(authId, RECIPIENT, 250_000_000, RESOURCE, 1);
        require(first, "first payment should succeed");
        require(vault.authorizationSpent(authId) == 250_000_000, "spent total mismatch");

        (bool second,) = _execute(authId, RECIPIENT, 151_000_000, RESOURCE, 2);
        require(!second, "cumulative cap must reject overspend");
        require(token.balanceOf(RECIPIENT) == 250_000_000, "overspend moved funds");
        require(vault.authorizationSpent(authId) == 250_000_000, "failed payment changed spent total");
    }

    function testUnauthorizedCallerCannotConsumeSingleUse() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, true, 11);
        vm.prank(OTHER_EXECUTOR);
        (bool unauthorized,) = _execute(authId, RECIPIENT, 100, RESOURCE, 1);
        require(!unauthorized, "unknown caller must not execute");
        require(token.balanceOf(RECIPIENT) == 0, "unauthorized caller moved funds");
        require(vault.authorizationSpent(authId) == 0, "unauthorized caller consumed budget");

        (bool ownerExecution,) = _execute(authId, RECIPIENT, 100, RESOURCE, 1);
        require(ownerExecution, "owner should still execute single-use payment");
    }

    function testConfiguredExecutorCanExecute() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 12);
        vault.setExecutor(OTHER_EXECUTOR);
        vm.prank(OTHER_EXECUTOR);
        (bool ok,) = _execute(authId, RECIPIENT, 361_000_000, RESOURCE, 1);
        require(ok, "configured executor should execute");
        require(token.balanceOf(RECIPIENT) == 361_000_000, "configured executor payment missing");
    }

    function testSingleUseAuthorizationRejectsSecondDistinctPayment() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, true, 6);
        (bool first,) = _execute(authId, RECIPIENT, 100, RESOURCE, 1);
        require(first, "first payment should succeed");
        (bool second,) = _execute(authId, RECIPIENT, 100, RESOURCE, 2);
        require(!second, "single-use authorization must reject second payment");
        require(token.balanceOf(RECIPIENT) == 100, "second payment moved funds");
    }

    function testResourceTamperRejected() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 7);
        (bool ok,) = _execute(authId, RECIPIENT, 361_000_000, "travel:EVIL-ROUTE", 1);
        require(!ok, "resource tamper must fail");
        require(token.balanceOf(RECIPIENT) == 0, "tampered resource moved funds");
    }

    function testWrongActionTypeCannotSpend() public {
        bytes32 scopeHash = vault.spendingScopeHash(address(token), RECIPIENT, keccak256(bytes(RESOURCE)));
        bytes32 authId = registry.grantAuthorization(
            address(vault),
            keccak256(bytes("BOOK_TRAVEL")),
            scopeHash,
            400_000_000,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            8,
            address(0),
            false
        );
        (bool ok,) = _execute(authId, RECIPIENT, 361_000_000, RESOURCE, 1);
        require(!ok, "non-payment authorization must fail");
    }

    function testOwnerCanFreezeVaultAgent() public {
        bytes32 authId = _grantPayment(RECIPIENT, 400_000_000, false, 9);
        vault.setAgentActive(false);
        (bool ok,) = _execute(authId, RECIPIENT, 361_000_000, RESOURCE, 1);
        require(!ok, "inactive vault agent must not record/pay");
    }
}
