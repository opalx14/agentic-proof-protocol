// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticProofRegistry} from "../src/AgenticProofRegistry.sol";

interface Vm {
    function prank(address) external;
    function warp(uint256) external;
}

contract AgenticProofRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    AgenticProofRegistry private registry;

    address private constant USER = address(0x1001);
    address private constant AGENT = address(0x2002);
    address private constant OTHER = address(0x3003);
    address private constant ATTESTOR = address(0x4004);

    bytes32 private constant AGENT_ID = keccak256("travel-agent");
    bytes32 private constant ACTION_TYPE = keccak256("BOOK_TRAVEL");
    bytes32 private constant OTHER_ACTION_TYPE = keccak256("PURCHASE_ITEM");
    bytes32 private constant SCOPE = keccak256("scope:singapore");
    bytes32 private constant ACTION_ID = keccak256("action:1");
    bytes32 private constant ACTION_HASH = keccak256("payload:1");
    bytes32 private constant TRACE_ROOT = keccak256("trace:1");

    function setUp() public {
        registry = new AgenticProofRegistry();
        vm.prank(AGENT);
        registry.registerAgent(AGENT_ID, keccak256("metadata"));
    }

    function _grant(uint64 validAfter, uint64 validUntil, uint256 cap, bool singleUse, address attestor)
        internal
        returns (bytes32)
    {
        vm.prank(USER);
        return registry.grantAuthorization(
            AGENT,
            ACTION_TYPE,
            SCOPE,
            cap,
            validAfter,
            validUntil,
            7,
            attestor,
            singleUse
        );
    }

    function _record(bytes32 authorizationId, bytes32 actionId, bytes32 actionType, bytes32 scope, uint256 value)
        internal
        returns (bool ok)
    {
        vm.prank(AGENT);
        (ok,) = address(registry).call(
            abi.encodeCall(
                AgenticProofRegistry.recordAction,
                (authorizationId, actionId, actionType, scope, ACTION_HASH, TRACE_ROOT, value)
            )
        );
    }

    function testHappyPathAndAttestation() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, true, ATTESTOR);
        require(_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 361_000_000), "record should succeed");

        vm.prank(ATTESTOR);
        registry.attestOutcome(ACTION_ID, keccak256("booking-confirmed"), keccak256("CONFIRMED"));

        (bool exists, bool validAtActionTime, bool current, bool attested) = registry.verifyAction(ACTION_ID);
        require(exists, "missing action");
        require(validAtActionTime, "authorization should be valid at record time");
        require(current, "authorization should still be active");
        require(attested, "attestation expected");
    }

    function testWrongAgentRejected() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, false, address(0));
        vm.prank(OTHER);
        (bool ok,) = address(registry).call(
            abi.encodeCall(
                AgenticProofRegistry.recordAction,
                (authId, ACTION_ID, ACTION_TYPE, SCOPE, ACTION_HASH, TRACE_ROOT, 1)
            )
        );
        require(!ok, "wrong agent must fail");
    }

    function testExpiredAuthorizationRejected() public {
        uint64 until = uint64(block.timestamp + 10);
        bytes32 authId = _grant(uint64(block.timestamp), until, 400_000_000, false, address(0));
        vm.warp(uint256(until) + 1);
        require(!_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 1), "expired auth must fail");
    }

    function testRevokedAuthorizationRejected() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, false, address(0));
        vm.prank(USER);
        registry.revokeAuthorization(authId);
        require(!_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 1), "revoked auth must fail");
    }

    function testOverCapRejected() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 100, false, address(0));
        require(!_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 101), "over cap must fail");
    }

    function testWrongActionTypeRejected() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, false, address(0));
        require(!_record(authId, ACTION_ID, OTHER_ACTION_TYPE, SCOPE, 1), "wrong action type must fail");
    }

    function testWrongScopeRejected() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, false, address(0));
        require(!_record(authId, ACTION_ID, ACTION_TYPE, keccak256("wrong"), 1), "wrong scope must fail");
    }

    function testDuplicateActionRejected() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, false, address(0));
        require(_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 1), "first record should succeed");
        require(!_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 1), "duplicate action must fail");
    }

    function testSingleUseAuthorizationRejectedOnSecondAction() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, true, address(0));
        require(_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 1), "first record should succeed");
        require(!_record(authId, keccak256("action:2"), ACTION_TYPE, SCOPE, 1), "second action must fail");
    }

    function testPastActionRemainsValidAfterRevocation() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, false, address(0));
        require(_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 1), "record should succeed");

        vm.warp(block.timestamp + 1);
        vm.prank(USER);
        registry.revokeAuthorization(authId);

        (bool exists, bool validAtActionTime, bool current,) = registry.verifyAction(ACTION_ID);
        require(exists, "action should exist");
        require(validAtActionTime, "revocation must not invalidate historical action");
        require(!current, "authorization should now be inactive");
    }

    function testUnauthorizedAttestorRejected() public {
        bytes32 authId = _grant(uint64(block.timestamp), uint64(block.timestamp + 1 hours), 400_000_000, false, ATTESTOR);
        require(_record(authId, ACTION_ID, ACTION_TYPE, SCOPE, 1), "record should succeed");

        vm.prank(OTHER);
        (bool ok,) = address(registry).call(
            abi.encodeCall(
                AgenticProofRegistry.attestOutcome,
                (ACTION_ID, keccak256("result"), keccak256("CONFIRMED"))
            )
        );
        require(!ok, "wrong attestor must fail");
    }
}
