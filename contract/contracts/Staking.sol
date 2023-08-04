// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";
import {console} from "hardhat/console.sol";

error Staking__InsufficientStakedBalance();
error Staking__InsufficientContractBalance();
error Staking__HasAvailableRewards();

contract Staking is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct Staker {
        uint256 stakedAmount;
        uint256 lastUpdated;
    }

    IERC20 public immutable Token;
    uint constant APY = 5;
    uint public totalStaked = 0;
    mapping(address => Staker) public stakers;

    constructor(address _token) {
        Token = IERC20(_token);
    }

    /**
     * @dev Stakes the given amount of tokens
     * @param _amount Amount of tokens to stake
     */
    function stake(uint256 _amount) public {
        if (stakers[msg.sender].stakedAmount == 0) {
            firstStake(_amount);
        } else {
            reStake(_amount);
        }
    }

    /**
     * @dev Stakes the given amount of tokens
     * @param _amount Amount of tokens to stake
     */
    function firstStake(uint256 _amount) internal {
        Token.transferFrom(msg.sender, address(this), _amount);
        stakers[msg.sender].lastUpdated = block.timestamp;
        stakers[msg.sender].stakedAmount = stakers[msg.sender].stakedAmount.add(
            _amount
        );
        totalStaked = totalStaked.add(_amount);
    }

    /**
     * @dev Applies the compounded rewards to the staked amount
     * and stakes the given amount of tokens while updating the
     * last updated timestamp
     * @notice This function is called when the staker
     * has already staked tokens before
     * @param _amount Amount of tokens to stake
     */
    function reStake(uint256 _amount) internal {
        Token.transferFrom(msg.sender, address(this), _amount);
        uint rewardAmount = calculateCompoundedRewards();
        uint newBalance = stakers[msg.sender]
            .stakedAmount
            .add(rewardAmount)
            .add(_amount);

        stakers[msg.sender].stakedAmount = newBalance;
        stakers[msg.sender].lastUpdated = block.timestamp;
        totalStaked = totalStaked.add(_amount);
    }

    /**
     * @dev Unstakes the given amount of tokens
     * @param _amountToUnstake Amount of tokens to unstake
     */
    function unstake(uint256 _amountToUnstake) public {
        uint availableRewards = getAvailableRewards();
        uint rewardAmount = calculateCompoundedRewards();
        uint maxUnstakableAmount = stakers[msg.sender].stakedAmount.add(
            rewardAmount
        );

        if (_amountToUnstake > maxUnstakableAmount) {
            revert Staking__InsufficientStakedBalance();
        }

        if (availableRewards < rewardAmount) {
            revert Staking__InsufficientContractBalance();
        }

        // Runs if wants to unstake less than the initial stake
        if (_amountToUnstake < stakers[msg.sender].stakedAmount) {
            _tansferToSenderAndUpdateStake(
                _amountToUnstake,
                maxUnstakableAmount,
                rewardAmount
            );
            return;
        }

        // Runs if wants to unstake the initial stake plus a portion of or all the rewards
        if (_amountToUnstake <= maxUnstakableAmount) {
            _tansferToSenderAndUpdateStake(
                _amountToUnstake,
                maxUnstakableAmount,
                rewardAmount
            );
            return;
        }
    }

    function _tansferToSenderAndUpdateStake(
        uint _amountToTransfer,
        uint _maxUnstakableAmount,
        uint _rewardAmount
    ) internal {
        uint remainingStakingAmount = _maxUnstakableAmount.sub(
            _amountToTransfer
        );
        Token.transfer(msg.sender, _amountToTransfer);
        stakers[msg.sender].stakedAmount = remainingStakingAmount;
        stakers[msg.sender].lastUpdated = block.timestamp;
        totalStaked = totalStaked.add(_rewardAmount).sub(_amountToTransfer);
    }

    /**
     * @dev Calculates the compounded rewards for the staker
     * @return The compounded rewards for the staker
     */
    function calculateCompoundedRewards() public view returns (uint256) {
        Staker memory staker = stakers[msg.sender];
        uint timeDifference = block.timestamp - staker.lastUpdated;
        uint numberOfWeeks = timeDifference / 1 weeks;
        uint balance = staker.stakedAmount;

        for (uint i = 0; i < numberOfWeeks; i++) {
            uint compoundedInterest = calculatePercentageOf(balance, APY).div(
                52
            );
            balance = balance.add(compoundedInterest);
        }

        return balance.sub(staker.stakedAmount);
    }

    /**
     * @dev Emergency withdraw function
     * @notice This function is called when the staker
     * wants to withdraw all the staked and renounce the rewards
     * because the contract doesn't have enough balance
     */
    function withdrawAll() public {
        uint rewardAmount = calculateCompoundedRewards();
        uint availableRewards = getAvailableRewards();

        if (availableRewards > rewardAmount) {
            revert Staking__HasAvailableRewards();
        }

        Token.transfer(msg.sender, stakers[msg.sender].stakedAmount);
        totalStaked = totalStaked.sub(stakers[msg.sender].stakedAmount);
        stakers[msg.sender].lastUpdated = 0;
        stakers[msg.sender].stakedAmount = 0;
    }

    /**
     * @dev Calculates the percentage of a number
     * @param amount The number to calculate the percentage of
     * @param percentage The percentage to calculate
     */
    function calculatePercentageOf(
        uint amount,
        uint percentage
    ) internal pure returns (uint) {
        return
            ABDKMathQuad.toUInt(
                ABDKMathQuad.div(
                    ABDKMathQuad.mul(
                        ABDKMathQuad.fromUInt(amount),
                        ABDKMathQuad.fromUInt(percentage)
                    ),
                    ABDKMathQuad.fromUInt(100)
                )
            );
    }

    /**
     * @dev Funds the contract with ERC20 tokens
     * @notice Only the owner can call this function
     * @param _amount Amount of tokens to fund the contract with
     */
    function fundContractWithErc20Token(uint256 _amount) public onlyOwner {
        Token.transferFrom(msg.sender, address(this), _amount);
    }

    /**
     * @dev Calculates the available rewards in the contract
     * by subtracting the total staked amount from the
     * total balance of the contract
     * @return The available rewards in the contract
     */
    function getAvailableRewards() public view returns (uint256) {
        return Token.balanceOf(address(this)).sub(totalStaked);
    }

    /**
     * @dev Returns the total staked amount
     * @return The total staked amount
     */
    function getStakedAmount() public view returns (uint256) {
        return totalStaked;
    }

    /**
     * @dev Returns the staked amount for a given address
     * @param _address The address to get the staked amount for
     * @return The staked amount for the given address
     */
    function getStakedAmountFor(
        address _address
    ) public view returns (uint256) {
        return stakers[_address].stakedAmount;
    }
}
