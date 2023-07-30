import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, approveAndStake, moveTimeForwardInWeeks, tokensAmount } from "./helper";

describe("Staking contract", function () {
  const thousandTokens = tokensAmount(1000);

  async function deployErc20Fixture() {
    const tokenFactory = await ethers.getContractFactory("Token");
    const tokenContract = await tokenFactory.deploy(thousandTokens);
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
      await tokenContract.approve(stakingContract.address, thousandTokens.add(tokensAmount(1)));

      await expect(stakingContract.fundContractWithErc20Token(thousandTokens.add(tokensAmount(1))))
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
      const tokens = thousandTokens.add(tokensAmount(1));
      await tokenContract.approve(stakingContract.address, tokens);

      await expect(stakingContract.stake(tokens))
        .revertedWith('ERC20: transfer amount exceeds balance');
    });
  })

  describe('Unstake', () => {
    it("allows to unstake tokens without rewards", async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const oneHundred = 100
      await approveAndStake(stakingContract, tokenContract, oneHundred)
      const oneHundredTokens = tokensAmount(oneHundred)

      expect(await stakingContract.unstake(oneHundredTokens)).to.changeTokenBalances(
        tokenContract,
        [deployerAddress, stakingContract.address],
        [oneHundredTokens, oneHundredTokens.mul(-1)]
      );
      expect(await stakingContract.getStakedAmountFor(deployerAddress)).to.equal(0)
      expect(await stakingContract.getStakedAmount()).to.equal(0);
    });

    it('allows to unstake tokens with rewards', async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const availableRewards = 10;
      await approveAndFundContract(stakingContract, tokenContract, availableRewards);
      const oneHundred = 100
      await approveAndStake(stakingContract, tokenContract, oneHundred)
      const weeksPassed = 52;
      await moveTimeForwardInWeeks(weeksPassed)

      const initialAvailableRewards = await stakingContract.getAvailableRewards();
      const initialStakedBalance = await stakingContract.getStakedAmountFor(deployerAddress);
      const rewards = await stakingContract.calculateCompoundedRewards();
      const amountToUnstake = await initialStakedBalance.add(rewards);
      await stakingContract.unstake(amountToUnstake);

      const finalStakedBalance = await stakingContract.getStakedAmountFor(deployerAddress);
      expect(finalStakedBalance).to.equal(0);
      expect(await stakingContract.getStakedAmount()).to.equal(0);
      expect(await stakingContract.getAvailableRewards()).to.equal(initialAvailableRewards.sub(rewards));
    });

    it('allows to unstake a fraction of the staked amount without rewards', async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const oneHundred = 100
      await approveAndStake(stakingContract, tokenContract, oneHundred)
      const fiftyTokens = tokensAmount(50)

      expect(await stakingContract.unstake(fiftyTokens)).to.changeTokenBalances(
        tokenContract,
        [deployerAddress, stakingContract.address],
        [fiftyTokens, fiftyTokens.mul(-1)]
      );
      expect(await stakingContract.getStakedAmountFor(deployerAddress)).to.equal(fiftyTokens)
      expect(await stakingContract.getStakedAmount()).to.equal(fiftyTokens);
    });

    it('allows to unstake a fraction of the staked amount with rewards', async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const availableRewards = 10;
      await approveAndFundContract(stakingContract, tokenContract, availableRewards);
      await approveAndStake(stakingContract, tokenContract, 100)
      await moveTimeForwardInWeeks(52)

      const initialAvailableRewards = await stakingContract.getAvailableRewards();
      const initialStakedBalance = await stakingContract.getStakedAmountFor(deployerAddress);
      const rewards = await stakingContract.calculateCompoundedRewards();

      // unstake half of the staked amount
      const amountToUnstake = tokensAmount(50);
      await stakingContract.unstake(amountToUnstake);

      const finalStakedBalance = await stakingContract.getStakedAmountFor(deployerAddress);
      expect(finalStakedBalance).to.equal(initialStakedBalance.sub(amountToUnstake).add(rewards));
      const contranctTotalStaked = await stakingContract.getStakedAmount();
      expect(contranctTotalStaked).to.equal(initialStakedBalance.sub(amountToUnstake).add(rewards));
      expect(await stakingContract.getAvailableRewards()).to.equal(initialAvailableRewards.sub(rewards));
    });

    xit('allows to unstake when the contract has no rewards and the staker deserves them', async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const oneHundred = 100
      await approveAndStake(stakingContract, tokenContract, oneHundred)
      const oneHundredTokens = tokensAmount(oneHundred)
      await moveTimeForwardInWeeks(52)

      const rewards = await stakingContract.calculateCompoundedRewards();

      expect(await stakingContract.unstake(oneHundredTokens)).to.changeTokenBalances(
        tokenContract,
        [deployerAddress, stakingContract.address],
        [oneHundredTokens, oneHundredTokens.mul(-1)]
      );
      expect(await stakingContract.getStakedAmountFor(deployerAddress)).to.equal(0)
      expect(await stakingContract.getStakedAmount()).to.equal(0);
      expect(await stakingContract.getAvailableRewards()).to.equal(0);
      expect(rewards).to.be.gt(0);
    });

    it("revert tx if staker has no balance when unstaking", async () => {
      const { stakingContract } = await loadFixture(deployFixture);
      const twoTokens = tokensAmount(2)

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

    it('reverts tx if staker tries to unstake more than the contract\'s balance', async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      // await approveAndFundContract(stakingContract, tokenContract, 5);
      await approveAndStake(stakingContract, tokenContract, 100)
      await moveTimeForwardInWeeks(52)

      await expect(stakingContract.unstake(tokensAmount(101)))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientContractBalance");
    })
  })

  describe('Reward system', () => {
    it('compounds after a whole week is passed', async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndStake(stakingContract, tokenContract, 100);
      await moveTimeForwardInWeeks(1)

      const rewardsWithOneWeek = await stakingContract.calculateCompoundedRewards()
      const formattedRewardsWithOneWeek = +ethers.utils.formatUnits(rewardsWithOneWeek, 18)
      await moveTimeForwardInWeeks(0.5)

      const rewardsWithHalfAWeek = await stakingContract.calculateCompoundedRewards()
      const formattedRewardsWithHalfAWeek = +ethers.utils.formatUnits(rewardsWithHalfAWeek, 18)

      expect(formattedRewardsWithOneWeek).to.equal(formattedRewardsWithHalfAWeek);
    });

    it('compounds correclty for the given amount of weeks', async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const hundredTokens = tokensAmount(100);
      const APY = 5;
      const expected = hundredTokens.add(hundredTokens.mul(APY).div(100));
      const formattedExpected = +ethers.utils.formatUnits(expected, 18)
      await approveAndStake(stakingContract, tokenContract, 100);
      await moveTimeForwardInWeeks(52);

      const stakedBalance = await stakingContract.getStakedAmountFor(deployerAddress);
      const rewards = await stakingContract.calculateCompoundedRewards();

      const totalBalance = stakedBalance.add(rewards);
      const formattedBalance = +ethers.utils.formatUnits(totalBalance, 18)
      expect(formattedBalance).to.be.closeTo(formattedExpected, 1);
    });
  })
});
