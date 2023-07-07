// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract Greeter {
    // Internal state to the contract
    string private greeting;

    constructor() {}

    // Read function (can be called without a transaction)
    function greet() public view returns (string memory) {
        return greeting;
    }

    // Write function (requires a transaction)
    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }
}
