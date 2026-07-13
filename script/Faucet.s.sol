// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {Faucet} from "../src/Faucet.sol";

contract FaucetScript is Script {
    address internal constant PAXG = 0x6d1b4ED809afbF4Aa80902c64540BFf059d1fA07;
    address internal constant USDC = 0x483688fb8Fe19CBf746438eD4571d7075eeabf0F;
    uint256 internal constant WAIT_TIME = 30 minutes;

    Faucet public faucet;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        faucet = new Faucet(PAXG, USDC, WAIT_TIME);

        vm.stopBroadcast();
    }
}
