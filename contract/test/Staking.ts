import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { Gal, Staking } from "../typechain-types";
import { expect } from "chai";

describe("Staking contract", function () {
  const TenGallTokens = ethers.utils.parseEther("10");

  async function deployErc20Fixture() {
    const gallTokenFactory = await ethers.getContractFactory("Gal");
    const gallToken = await gallTokenFactory.deploy(TenGallTokens);
    await gallToken.deployed();

    return { gallToken };
  }

  async function deployFixture() {
    const [deployer] = await ethers.getSigners();
    const { gallToken } = await loadFixture(deployErc20Fixture);
    const gallTokenAddress = gallToken.address;
    const stakingFactory = await ethers.getContractFactory("Staking")
    const staking = await stakingFactory.deploy(gallTokenAddress);
    await printContractsInfo(staking, gallToken, deployer.address);
    return { staking, gallToken, deployer };
  }

  describe('Fund contract with GAL tokens', function () {
    it("funds with the given amout of tokens", async function () {
      const { staking, gallToken, deployer } = await loadFixture(deployFixture);
      const fiveTokens = ethers.utils.parseEther("5");
      await gallToken.approve(staking.address, fiveTokens);
      await staking.fundContractWithGall(fiveTokens)

      expect(await staking.getContractGalBalance()).to.equal(fiveTokens);
      expect(await gallToken.balanceOf(staking.address)).to.equal(fiveTokens);
      expect(await gallToken.balanceOf(deployer.address)).to.equal(TenGallTokens.sub(fiveTokens));
    });

    it('reverts if allowance is not enough', async function () {
      const { staking } = await loadFixture(deployFixture);
      const fiveTokens = ethers.utils.parseEther("5");

      await expect(staking.fundContractWithGall(fiveTokens)).revertedWithCustomError(staking, "Staking__InsufficientAllowance");
    });

    it('reverts if amount is not enough', async function () {
      const { staking, gallToken } = await loadFixture(deployFixture);
      const twentyTokens = ethers.utils.parseEther("20");
      await gallToken.approve(staking.address, twentyTokens);

      await expect(staking.fundContractWithGall(twentyTokens)).revertedWithCustomError(staking, "Staking__InsufficientBalance");
    });
  });

  describe('Stake GAL tokens', function () {
    it("allows to stake GAL tokens", async function () {
      const { staking, gallToken, deployer } = await loadFixture(deployFixture);
      // fund contract with 5 GAL tokens
      const fiveTokens = ethers.utils.parseEther("5");
      await gallToken.approve(staking.address, fiveTokens);
      await staking.fundContractWithGall(fiveTokens)
      // stake 2 GAL tokens
      const twoTokens = ethers.utils.parseEther("2");

      await gallToken.approve(staking.address, twoTokens);
      await staking.stake(twoTokens);
      expect(await staking.getContractGalBalance()).to.equal(fiveTokens.add(twoTokens));
      expect(await gallToken.balanceOf(deployer.address)).to.equal(TenGallTokens.sub(fiveTokens).sub(twoTokens));
      expect(await staking.getStakedAmount(deployer.address)).to.equal(twoTokens);
    });

    it('reverts if allowance is not enough', async function () {
      const { staking, gallToken } = await loadFixture(deployFixture);
      const fiveTokens = ethers.utils.parseEther("5");
      await gallToken.approve(staking.address, fiveTokens);
      await staking.fundContractWithGall(fiveTokens)
      const twoTokens = ethers.utils.parseEther("2");

      await expect(staking.stake(twoTokens)).revertedWithCustomError(staking, "Staking__InsufficientAllowance");
    });

    it('reverts if amount is not enough', async function () {
      const { staking, gallToken } = await loadFixture(deployFixture);
      const twentyTokens = ethers.utils.parseEther("20");
      const fiveTokens = ethers.utils.parseEther("5");
      await gallToken.approve(staking.address, twentyTokens);
      await staking.fundContractWithGall(fiveTokens)
      const sevenTokens = ethers.utils.parseEther("7");

      await expect(staking.stake(sevenTokens)).revertedWithCustomError(staking, "Staking__InsufficientBalance");
    });
  });



  it("allows to unstake GAL tokens");
  it("performs weekly payouts");
  it("pays stakers in GAL tokens");
  it("calculates the correct amount of GAL tokens to be paid out based on the staked amount and the duration of the stake (5% APY)");


  async function printContractsInfo(stakingContract: Staking, gallToken: Gal, deployer: string) {
    console.log('Deployer address:', deployer);
    console.log('Staking contract address:', stakingContract.address);
    console.log('Gall token address:', gallToken.address);
    console.log("Gall decimal", await gallToken.decimals());
    const totalSupply = await gallToken.totalSupply();
    console.log('Gall total supply:', ethers.utils.formatEther(totalSupply));
    console.log('Deployer initial balance:', ethers.utils.formatEther(await gallToken.balanceOf(deployer)));
  }
});
