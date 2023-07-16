import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { Gal, Staking } from "../typechain-types";
import { expect } from "chai";

describe("Staking contract", function () {
  const TenGallTokens = ethers.utils.parseEther("10");

  async function deployErc20Fixture() {
    const gallTokenFactory = await ethers.getContractFactory("Gal");
    const gallContract = await gallTokenFactory.deploy(TenGallTokens);
    await gallContract.deployed();

    return { gallContract };
  }

  async function deployFixture() {
    const [deployer] = await ethers.getSigners();
    const { gallContract } = await loadFixture(deployErc20Fixture);
    const gallTokenAddress = gallContract.address;
    const stakingFactory = await ethers.getContractFactory("Staking")
    const stakingContract = await stakingFactory.deploy(gallTokenAddress);
    await printContractsInfo(stakingContract, gallContract, deployer.address);

    return { stakingContract, gallContract, deployer };
  }

  describe('Fund contract with GAL tokens', function () {
    it("funds with the given amout of tokens", async function () {
      const { stakingContract, gallContract, deployer } = await loadFixture(deployFixture);
      const fiveTokens = ethers.utils.parseEther("5");
      await approveAndFundContract(stakingContract, gallContract, 5);

      expect(await stakingContract.getContractGalBalance()).to.equal(fiveTokens);
      expect(await gallContract.balanceOf(stakingContract.address)).to.equal(fiveTokens);
      expect(await gallContract.balanceOf(deployer.address)).to.equal(TenGallTokens.sub(fiveTokens));
    });

    it('reverts if allowance is not enough', async function () {
      const { stakingContract } = await loadFixture(deployFixture);
      const fiveTokens = ethers.utils.parseEther("5");

      await expect(stakingContract.fundContractWithGall(fiveTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientAllowance");
    });

    it('reverts if balance is not enough', async function () {
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      const twentyTokens = ethers.utils.parseEther("20");

      await gallContract.approve(stakingContract.address, twentyTokens);

      await expect(stakingContract.fundContractWithGall(twentyTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientBalance");
    });
  });

  describe('Stake GAL tokens', function () {
    it("allows to stake GAL tokens", async function () {
      const { stakingContract, gallContract, deployer } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, gallContract, 5)
      const fiveTokens = ethers.utils.parseEther("5");
      const twoTokens = ethers.utils.parseEther("2");

      await gallContract.approve(stakingContract.address, twoTokens);
      await stakingContract.stake(twoTokens);

      expect(await stakingContract.getContractGalBalance()).to.equal(fiveTokens.add(twoTokens));
      expect(await gallContract.balanceOf(deployer.address)).to.equal(TenGallTokens.sub(fiveTokens).sub(twoTokens));
      expect(await stakingContract.getStakedAmount(deployer.address)).to.equal(twoTokens);
    });

    it('reverts if allowance is not enough', async function () {
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, gallContract, 5);
      const twoTokens = ethers.utils.parseEther("2");

      await expect(stakingContract.stake(twoTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientAllowance");
    });

    it('reverts if amount is not enough', async function () {
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      const twentyTokens = ethers.utils.parseEther("20");
      const fiveTokens = ethers.utils.parseEther("5");
      const sevenTokens = ethers.utils.parseEther("7");
      await gallContract.approve(stakingContract.address, twentyTokens);
      await stakingContract.fundContractWithGall(fiveTokens)

      await expect(stakingContract.stake(sevenTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientBalance");
    });
  });



  it("allows to unstake GAL tokens");
  it("performs weekly payouts");
  it("pays stakers in GAL tokens");
  it("calculates the correct amount of GAL tokens to be paid out based on the staked amount and the duration of the stake (5% APY)");


  async function printContractsInfo(stakingContract: Staking, gallContract: Gal, deployer: string) {
    console.log('Deployer address:', deployer);
    console.log('Staking contract address:', stakingContract.address);
    console.log('Gall token address:', gallContract.address);
    console.log("Gall decimal", await gallContract.decimals());
    const totalSupply = await gallContract.totalSupply();
    console.log('Gall total supply:', ethers.utils.formatEther(totalSupply));
    console.log('Deployer initial balance:', ethers.utils.formatEther(await gallContract.balanceOf(deployer)));
  }

  async function approveAndFundContract(stakingContract: Staking, gallContract: Gal, amount: number) {
    const tokens = ethers.utils.parseEther(`${amount}`);
    await approveWith(gallContract, stakingContract.address, amount);
    await stakingContract.fundContractWithGall(tokens)
  }

  async function approveWith(gallContract: Gal, address: string, amount: number) {
    const tokens = ethers.utils.parseEther(`${amount}`);
    await gallContract.approve(address, tokens);
  }
});
