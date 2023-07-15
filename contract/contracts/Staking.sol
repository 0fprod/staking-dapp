// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import { console } from "hardhat/console.sol";

error Staking__InsufficientAllowance();
error Staking__InsufficientBalance();

contract Staking {
    IERC20 public Gall;

    mapping(address => uint) public stakedBalanceOf;

    modifier notEnoughAllowance(uint256 _amount) {
        if (Gall.allowance(msg.sender, address(this)) < _amount) {
            revert Staking__InsufficientAllowance();
        }
        _;
    }

    modifier notEnoughBalance(uint256 _amount) {
        if (_amount > Gall.balanceOf(msg.sender)) {
            revert Staking__InsufficientBalance();
        }
        _;
    }

    constructor(address _gall) {
        Gall = IERC20(_gall);
    }

    function fundContractWithGall(
        uint256 _amount
    ) public notEnoughAllowance(_amount) notEnoughBalance(_amount) {
        Gall.transferFrom(msg.sender, address(this), _amount);
    }

    function getContractGalBalance() public view returns (uint256) {
        return Gall.balanceOf(address(this));
    }

    function stake(
        uint256 _amount
    ) public notEnoughAllowance(_amount) notEnoughBalance(_amount) {
        Gall.transferFrom(msg.sender, address(this), _amount);
        stakedBalanceOf[msg.sender] += _amount;
    }

    function getStakedAmount(address _address) public view returns (uint256) {
        return stakedBalanceOf[_address];
    }
}
