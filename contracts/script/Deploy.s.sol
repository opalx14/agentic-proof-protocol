// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticProofRegistry} from "../src/AgenticProofRegistry.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployAgenticProofRegistry {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (AgenticProofRegistry registry) {
        vm.startBroadcast();
        registry = new AgenticProofRegistry();
        vm.stopBroadcast();
    }
}
