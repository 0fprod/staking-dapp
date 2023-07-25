import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, approveAndStake, moveTimeForwardInWeeks, tokensAmount } from "./helper";

describe("Staking contract", function () {

  async function deployErc20Fixture() {
    const tokenFactory = await ethers.getContractFactory("Token");
    const tokenContract = await tokenFactory.deploy(tokensAmount(10));
    await tokenContract.deployed();

    return { tokenContract };
  }

  async function deployFixture() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const stakingFactory = await ethers.getContractFactory("Staking")
    const stakingContract = await stakingFactory.deploy(tokenAddress);

    return { stakingContract, tokenContract, deployerAddress };
  }

  describe('Deployment', () => {
    it("is funded with the given amount of tokens", async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      const fiveTokens = tokensAmount(5);
      await approveAndFundContract(stakingContract, tokenContract, 5);

      expect(await stakingContract.getAvailableRewards()).to.equal(fiveTokens);
      expect(await tokenContract.balanceOf(stakingContract.address)).to.equal(fiveTokens);
    });

    it('reverts tx if sender\'s allowance is not enough when funding', async () => {
      const { stakingContract } = await loadFixture(deployFixture);
      const fiveTokens = tokensAmount(5);

      await expect(stakingContract.fundContractWithErc20Token(fiveTokens))
        .revertedWith('ERC20: insufficient allowance')
    });

    it('reverts tx if sender\'s balance is not enough when funding', async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      const twentyTokens = tokensAmount(20);

      await tokenContract.approve(stakingContract.address, twentyTokens);

      await expect(stakingContract.fundContractWithErc20Token(twentyTokens))
        .revertedWith('ERC20: transfer amount exceeds balance');
    });

    it('has 0 staked amount', async () => {
      const { stakingContract } = await loadFixture(deployFixture);
      expect(await stakingContract.getStakedAmount()).to.equal(tokensAmount(0));
    });
  })

  describe('Stake', () => {
    it("allows to stake tokens", async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const twoTokens = tokensAmount(2);
      await tokenContract.approve(stakingContract.address, twoTokens);

      await expect(stakingContract.stake(twoTokens)).to.changeTokenBalances(
        tokenContract,
        [deployerAddress, stakingContract.address],
        [twoTokens.mul(-1), twoTokens]
      );
    });

    it('reverts tx if sender\'s allowance is not enough when staking', async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, tokenContract, 5);
      const twoTokens = tokensAmount(2);

      await expect(stakingContract.stake(twoTokens))
        .revertedWith('ERC20: insufficient allowance')
    });

    it('reverts tx if sender\'s amount is not enough when staking', async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      const twentyTokens = tokensAmount(20);
      const fiveTokens = tokensAmount(5);
      const sevenTokens = tokensAmount(7);
      await tokenContract.approve(stakingContract.address, twentyTokens);
      await stakingContract.fundContractWithErc20Token(fiveTokens)

      await expect(stakingContract.stake(sevenTokens))
        .revertedWith('ERC20: transfer amount exceeds balance');
    });
  })

  describe('Unstake', () => {
    it("allows to unstake tokens", async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const twoTokens = tokensAmount(2)
      await approveAndStake(stakingContract, tokenContract, 2)

      expect(await stakingContract.unstake(twoTokens)).to.changeTokenBalances(
        tokenContract,
        [deployerAddress, stakingContract.address],
        [twoTokens, twoTokens.mul(-1)]
      );
      expect(await stakingContract.getStakedAmountFor(deployerAddress)).to.equal(0)
      expect(await stakingContract.getAvailableRewards()).to.equal(0);
    });

    it("revert tx if staker has no balance when unstaking", async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      const twoTokens = tokensAmount(2)
      await approveAndFundContract(stakingContract, tokenContract, 5);

      await expect(stakingContract.unstake(twoTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientStakedBalance");
    })

    it("reverts tx if staker tries to unstake more than the staked amount", async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, tokenContract, 5);
      await approveAndStake(stakingContract, tokenContract, 2)

      await stakingContract.unstake(tokensAmount(1));

      await expect(stakingContract.unstake(tokensAmount(2)))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientStakedBalance");
    })
  })

  describe('Reward system', () => {
    it('should calculate rewards per second correctly', async () => {
      // Test that the contract calculates the rewards per second correctly based on the staked amount.
      // Stake 10 tokens, expect 5% annual interest, and verify the rewards per second.    
      const oneWeek = 604800 // 1 week in seconds
      const tenTokens = 10;
      const expectedRewardsAfterOneWeek = (tenTokens * 5 / 100) / (oneWeek * 52);
      const formattedExpectedRewards = expectedRewardsAfterOneWeek.toFixed(18).toString();
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndStake(stakingContract, tokenContract, tenTokens);

      const rewardsPerSecondInWei = await stakingContract.calculateTokenRewardPerSecond()
      const formattedRewards = ethers.utils.formatUnits(rewardsPerSecondInWei, 18);

      expect(formattedRewards).to.eq(formattedExpectedRewards);
    });

    it('should compound rewards and increase balance while reducing available rewards', async () => {
      // Test that the contract correctly compounds rewards after one week of staking.
      // Stake 1 token, fund the contract with 5 tokens, and verify balance and available rewards.    
      const oneToken = 1;
      const weeksPassed = 1;
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, tokenContract, 5);
      await approveAndStake(stakingContract, tokenContract, oneToken);
      await moveTimeForwardInWeeks(weeksPassed)

      const initialRewards = await stakingContract.getAvailableRewards();
      const initialBalance = await stakingContract.getStakedAmountFor(deployerAddress);
      await stakingContract.compoundRewards();
      const finalRewards = await stakingContract.getAvailableRewards();
      const finalBalance = await stakingContract.getStakedAmountFor(deployerAddress);

      expect(finalBalance).to.gt(initialBalance);
      expect(finalRewards).to.lt(initialRewards);
    });

    it('should compound rewards correctly after one year', async () => {
      // Test that the contract compounds rewards correctly after one year (52 weeks).
      // Stake 1 token, expect 5% annual interest, and verify the staked amount after one year.
      // The expected staked amount should be 1.05 tokens, considering 18 decimal places.    
      const weeksPassed = 52;
      const expectedStakedAmount = '1.05';
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, tokenContract, 5);
      await approveAndStake(stakingContract, tokenContract, 1);
      await moveTimeForwardInWeeks(weeksPassed)

      await stakingContract.compoundRewards();

      const stakedAmountAfterOneYear = await stakingContract.getStakedAmountFor(deployerAddress);
      const formattedStakedAmount = ethers.utils.formatUnits(stakedAmountAfterOneYear, 18).substring(0, 4);
      expect(formattedStakedAmount).to.equal(expectedStakedAmount);
    })

    it('reverts tx if you try to compound rewards before a week passed', async () => {
      const oneToken = 1;
      const weeksPassed = 0;
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndStake(stakingContract, tokenContract, oneToken);
      await moveTimeForwardInWeeks(weeksPassed)

      await expect(stakingContract.compoundRewards())
        .revertedWithCustomError(stakingContract, "Staking__InsufficientTimePassed");
    });

    it('reverts tx if rewards amount exceeds contract\'s balance', async () => {
      const oneToken = 1;
      const weeksPassed = 1040; // 20 years
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndStake(stakingContract, tokenContract, oneToken);
      await moveTimeForwardInWeeks(weeksPassed)

      await expect(stakingContract.compoundRewards())
        .revertedWithCustomError(stakingContract, "Staking__InsufficientContractBalance");
    });
  })
});
