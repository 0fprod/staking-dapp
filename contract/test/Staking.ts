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

  it("is funded with the given amount of tokens", async () => {
    const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
    const fiveTokens = tokensAmount(5);
    const tenTokens = tokensAmount(10);
    await approveAndFundContract(stakingContract, tokenContract, 5);

    expect(await stakingContract.getContractBalance()).to.equal(fiveTokens);
    expect(await tokenContract.balanceOf(stakingContract.address)).to.equal(fiveTokens);
    expect(await tokenContract.balanceOf(deployerAddress)).to.equal(tenTokens.sub(fiveTokens));
  });

  it('reverts tx if sender\'s allowance is not enough when funding', async () => {
    const { stakingContract } = await loadFixture(deployFixture);
    const fiveTokens = tokensAmount(5);

    await expect(stakingContract.fundContractWithErc20Token(fiveTokens))
      .revertedWithCustomError(stakingContract, "Staking__InsufficientAllowance");
  });

  it('reverts tx if sender\'s balance is not enough when funding', async () => {
    const { stakingContract, tokenContract } = await loadFixture(deployFixture);
    const twentyTokens = tokensAmount(20);

    await tokenContract.approve(stakingContract.address, twentyTokens);

    await expect(stakingContract.fundContractWithErc20Token(twentyTokens))
      .revertedWithCustomError(stakingContract, "Staking__InsufficientBalance");
  });

  it("allows to stake tokens", async () => {
    const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
    const tenTokens = tokensAmount(10);
    const fiveTokens = tokensAmount(5);
    const twoTokens = tokensAmount(2);
    await approveAndFundContract(stakingContract, tokenContract, 5)

    await approveAndStake(stakingContract, tokenContract, 2)

    expect(await stakingContract.getContractBalance()).to.equal(fiveTokens.add(twoTokens));
    expect(await tokenContract.balanceOf(deployerAddress)).to.equal(tenTokens.sub(fiveTokens).sub(twoTokens));
    expect(await stakingContract.getStakedAmount(deployerAddress)).to.equal(twoTokens);
  });

  it('reverts tx if sender\'s allowance is not enough when staking', async () => {
    const { stakingContract, tokenContract } = await loadFixture(deployFixture);
    await approveAndFundContract(stakingContract, tokenContract, 5);
    const twoTokens = tokensAmount(2);

    await expect(stakingContract.stake(twoTokens))
      .revertedWithCustomError(stakingContract, "Staking__InsufficientAllowance");
  });

  it('reverts tx if sender\'s amount is not enough when staking', async () => {
    const { stakingContract, tokenContract } = await loadFixture(deployFixture);
    const twentyTokens = tokensAmount(20);
    const fiveTokens = tokensAmount(5);
    const sevenTokens = tokensAmount(7);
    await tokenContract.approve(stakingContract.address, twentyTokens);
    await stakingContract.fundContractWithErc20Token(fiveTokens)

    await expect(stakingContract.stake(sevenTokens))
      .revertedWithCustomError(stakingContract, "Staking__InsufficientBalance");
  });

  it("allows to unstake tokens", async () => {
    const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
    const twoTokens = tokensAmount(2)
    await approveAndFundContract(stakingContract, tokenContract, 5);
    await approveAndStake(stakingContract, tokenContract, 2)

    await stakingContract.unstake(twoTokens);

    expect(await tokenContract.balanceOf(deployerAddress)).to.equal(tokensAmount(5))
    expect(await stakingContract.getStakedAmount(deployerAddress)).to.equal(tokensAmount(0))
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

  it('calculates the reward per token based on 5% apy', async () => {
    // 5 % APY = 0.05 
    // 1 * (5 / 100) / 1 year in seconds = 0.000000001589845339
    // With 1 token at 5% makes 0.000000001589845339 every second
    const tenTokens = 1;
    const { stakingContract, tokenContract } = await loadFixture(deployFixture);
    const rewardPerToken = 1589845339
    await approveAndStake(stakingContract, tokenContract, tenTokens);

    expect((await stakingContract.calculateTokenRewardPerSecond())).to.eq(rewardPerToken);
  });

  it('calculates all the rewards per time staked', async () => {
    const oneToken = 1;
    const weeksPassed = 52;
    const { stakingContract, tokenContract } = await loadFixture(deployFixture);
    await approveAndStake(stakingContract, tokenContract, oneToken);
    await moveTimeForwardInWeeks(weeksPassed)

    // around 0.05 tokens
    expect(await stakingContract.calculateRewards()).to.gte(tokensAmount(0.05));
    expect(await stakingContract.calculateRewards()).to.lte(tokensAmount(0.051));
  })

  it('allows to claim rewards', async () => {
    const oneToken = 1;
    const weeksPassed = 52;
    const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
    await approveAndStake(stakingContract, tokenContract, oneToken);
    await moveTimeForwardInWeeks(weeksPassed)

    const initialBalance = await tokenContract.balanceOf(deployerAddress);
    const initialContractBalance = await tokenContract.balanceOf(stakingContract.address);
    await stakingContract.claimReward();
    const finalBalance = await tokenContract.balanceOf(deployerAddress);
    const finalContractBalance = await tokenContract.balanceOf(stakingContract.address);

    expect(finalBalance).to.gt(initialBalance);
    expect(finalContractBalance).to.lt(initialContractBalance);
  });

  it('reverts tx if clamied amount exceeds contract\'s balance', async () => {
    const oneToken = 1;
    const weeksPassed = 1040; // 20 years
    const { stakingContract, tokenContract } = await loadFixture(deployFixture);
    await approveAndStake(stakingContract, tokenContract, oneToken);
    await moveTimeForwardInWeeks(weeksPassed)

    await expect(stakingContract.claimReward())
      .revertedWithCustomError(stakingContract, "Staking__InsufficientContractBalance");
  });
});
