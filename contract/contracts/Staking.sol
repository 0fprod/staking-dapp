// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {console} from "hardhat/console.sol";

contract Staking {
    IERC20 public Gall;

    mapping(address => uint) public stakedBalanceOf;

    constructor(address _gall) {
        Gall = IERC20(_gall);
    }

    function fundContractWithGall(uint256 _amount) public {
        require(
            Gall.allowance(msg.sender, address(this)) >= _amount,
            "Insufficient allowance"
        );

        Gall.transferFrom(msg.sender, address(this), _amount);
    }

    function getContractGalBalance() public view returns (uint256) {
        return Gall.balanceOf(address(this));
    }

    function stake(uint256 _amount) public {
        // require(Gall.balanceOf(msg.sender) >= _amount, "Insufficient balance");

        Gall.transferFrom(msg.sender, address(this), _amount);
        stakedBalanceOf[msg.sender] += _amount;
    }

    function getStakedAmount(address _address) public view returns (uint256) {
        return stakedBalanceOf[_address];
    }
}
