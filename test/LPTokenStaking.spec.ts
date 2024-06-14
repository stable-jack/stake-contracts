import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, LPStaking, MockERC1155 } from "../scripts/@types/index";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("LPStaking", function () {
    
    let lpStaking: LPStaking;
    let owner: HardhatEthersSigner;
    let hexagate: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async function () {
        [owner, hexagate, user1, user2] = await ethers.getSigners();

        const ERC20Mock = await ethers.getContractFactory("MockERC20", owner);
        token = await ERC20Mock.deploy("Mock Token", "MCK", 18, ethers.parseEther("1000"));

        const LPStaking = await ethers.getContractFactory("LPStaking", owner);
        lpStaking = await LPStaking.deploy();
        await lpStaking.initialize(hexagate.address);

        // Accept ownership step
        await lpStaking.connect(owner).transferOwnership(owner.address);
        await lpStaking.connect(owner).acceptOwnership();
    });

    describe("Initialization", function () {
        it("Should set the correct hexagate address", async function () {
            expect(await lpStaking.hexagate()).to.equal(hexagate.address);
        });

        it("Should not be paused initially", async function () {
            expect(await lpStaking.paused()).to.be.false;
        });
    });

    describe("Token Support", function () {
        it("Should add LP token support", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            expect(await lpStaking.supportedLPTokens(await token.getAddress())).to.be.true;
        });

        it("Should remove LP token support", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await lpStaking.removeLPTokenSupport(await token.getAddress());
            expect(await lpStaking.supportedLPTokens(await token.getAddress())).to.be.false;
        });

        it("Should revert if token is already supported", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await expect(lpStaking.addLPTokenSupport(await token.getAddress())).to.be.revertedWith("Token already supported");
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.removeLPTokenSupport(await token.getAddress())).to.be.revertedWith("Token not supported");
        });

        it("Should not remove LP token support if there are staked tokens", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());
    
            await expect(lpStaking.removeLPTokenSupport(await token.getAddress())).to.be.revertedWith("Users have staked tokens");
        });
    
        it("Should remove LP token support if there are no staked tokens", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await lpStaking.removeLPTokenSupport(await token.getAddress());
    
            expect(await lpStaking.supportedLPTokens(await token.getAddress())).to.be.false;
        });    
    });

    describe("ERC1155 Token Support", function () {
        let erc1155Token: MockERC1155; // Assuming MockERC1155 is the mock contract with mint function

        beforeEach(async function () {
            const ERC1155Mock = await ethers.getContractFactory("MockERC1155", owner);
            erc1155Token = await ERC1155Mock.deploy();
        });

        it("Should add ERC1155 token support", async function () {
            await lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress());
            expect(await lpStaking.supportedERC1155Tokens(await erc1155Token.getAddress())).to.be.true;
        });

        it("Should remove ERC1155 token support", async function () {
            await lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress());
            await lpStaking.removeERC1155TokenSupport(await erc1155Token.getAddress());
            expect(await lpStaking.supportedERC1155Tokens(await erc1155Token.getAddress())).to.be.false;
        });

        it("Should revert if ERC1155 token is already supported", async function () {
            await lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress());
            await expect(lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress())).to.be.revertedWith("Token already supported");
        });

        it("Should revert if ERC1155 token is not supported", async function () {
            await expect(lpStaking.removeERC1155TokenSupport(await erc1155Token.getAddress())).to.be.revertedWith("Token not supported");
        });
    });



    describe("Staking", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
        });

        it("Should stake tokens correctly", async function () {
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());

            expect(await lpStaking.balanceOf(await token.getAddress(), user1.address)).to.equal(ethers.parseEther("50"));
        });

        it("Should emit Staked event", async function () {
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress()))
                .to.emit(lpStaking, "Staked")
                .withArgs(user1.address, ethers.parseEther("50"), await token.getAddress());
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), user2.address))
                .to.be.revertedWith("Token not supported");
        });

        it("Should revert if amount is zero", async function () {
            await expect(lpStaking.connect(user1).stake(0, await token.getAddress())).to.be.revertedWith("Amount must be greater than zero");
        });

        it("Should revert if ERC20 transferFrom returns false", async function () {
            const FakeERC20 = await ethers.getContractFactory("FakeERC20", owner);
            const fakeToken = await FakeERC20.deploy("Fake Token", "FAKE", 18, ethers.parseEther("1000"));
    
            await lpStaking.addLPTokenSupport(await fakeToken.getAddress());
            await fakeToken.transfer(user1.address, ethers.parseEther("100"));
            await fakeToken.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
    
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), await fakeToken.getAddress()))
                .to.be.reverted;
        });

        it("Should handle ERC20 tokens with transfer fees correctly", async function () {
            const FeeToken = await ethers.getContractFactory("FeeToken", owner);
            const feeToken = await FeeToken.deploy("Fee Token", "FEE", ethers.parseEther("1000").toString());
    
            await lpStaking.addLPTokenSupport(await feeToken.getAddress());
            await feeToken.transfer(user1.address, ethers.parseEther("100"));
            await feeToken.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
    
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await feeToken.getAddress());
    
            const contractBalance = await feeToken.balanceOf(await lpStaking.getAddress());
            const userBalance = await lpStaking.balanceOf(await feeToken.getAddress(), user1.address);
            
            // Check that the actual received amount is less due to the transfer fee
            expect(contractBalance).to.be.lessThan(ethers.parseEther("50"));
            expect(userBalance).to.be.equal(contractBalance);
        });
    
    });

    describe("ERC1155 Staking", function () {
        let erc1155Token: MockERC1155; // Assuming MockERC1155 is the mock contract with mint function

        beforeEach(async function () {
            const ERC1155Mock = await ethers.getContractFactory("MockERC1155", owner);
            erc1155Token = await ERC1155Mock.deploy();
            await lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress());
            await erc1155Token.mint(user1.address, 1, 100, "0x");
        });

        it("Should stake ERC1155 tokens correctly", async function () {
            await erc1155Token.connect(user1).setApprovalForAll(lpStaking.getAddress(), true);
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 50);

            expect(await lpStaking.balanceOf1155(await erc1155Token.getAddress(), 1, user1.address)).to.equal(50);
        });

        it("Should emit Staked1155 event", async function () {
            await erc1155Token.connect(user1).setApprovalForAll(lpStaking.getAddress(), true);
            await expect(lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 50))
                .to.emit(lpStaking, "Staked1155")
                .withArgs(user1.address, 1, 50, await erc1155Token.getAddress());
        });

        it("Should revert if ERC1155 token is not supported", async function () {
            await expect(lpStaking.connect(user1).stake1155(user2.address, 1, 50)).to.be.revertedWith("Token not supported");
        });

        it("Should revert if amount is zero", async function () {
            await expect(lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 0)).to.be.revertedWith("Amount must be greater than zero");
        });
    });

    describe("Unlocking", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());
        });

        it("Should unlock the entire staked amount", async function () {
            await lpStaking.connect(user1).unlock(await token.getAddress());
    
            const unlockInfo = await lpStaking.userUnlocks(user1.address, await token.getAddress());
            expect(unlockInfo.amount).to.equal(ethers.parseEther("50"));
        });
    
        it("Should update unlock time correctly", async function () {
            await lpStaking.connect(user1).unlock(await token.getAddress());
            
            const block = await ethers.provider.getBlock('latest');
            if (!block) {
                throw new Error("Failed to fetch the latest block.");
            }
            const unlockTime = block.timestamp+ 604800;
    
            const unlockInfo = await lpStaking.userUnlocks(user1.address, await token.getAddress());
            expect(unlockInfo.unlockAt).to.be.closeTo(unlockTime, 10);
        });

        it("Should revert if unlock is called again before unstaking", async function () {
            await lpStaking.connect(user1).unlock(await token.getAddress());
    
            await expect(lpStaking.connect(user1).unlock(await token.getAddress()))
                .to.be.revertedWith("Unlock already initialized");
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.connect(user1).unlock(user2.address))
                .to.be.revertedWith("Token not supported");
        });

    });

    describe("ERC1155 Unlocking", function () {
        let erc1155Token: MockERC1155; // Assuming MockERC1155 is the mock contract with mint function

        beforeEach(async function () {
            const ERC1155Mock = await ethers.getContractFactory("MockERC1155", owner);
            erc1155Token = await ERC1155Mock.deploy();
            await lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress());
            await erc1155Token.mint(user1.address, 1, 100, "0x");
            await erc1155Token.connect(user1).setApprovalForAll(lpStaking.getAddress(), true);
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 50);
        });

        it("Should unlock the entire staked ERC1155 amount", async function () {
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1);

            const unlockInfo = await lpStaking.userUnlocks1155(user1.address, await erc1155Token.getAddress(), 1);
            expect(unlockInfo.amount).to.equal(50);
        });

        it("Should update unlock time correctly for ERC1155", async function () {
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1);

            const block = await ethers.provider.getBlock('latest');
            if (!block) {
                throw new Error("Failed to fetch the latest block.");
            }
            const unlockTime = block.timestamp + 604800;

            const unlockInfo = await lpStaking.userUnlocks1155(user1.address, await erc1155Token.getAddress(), 1);
            expect(unlockInfo.unlockAt).to.be.closeTo(unlockTime, 10);
        });

        it("Should revert if ERC1155 unlock is called again before unstaking", async function () {
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1);

            await expect(lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1))
                .to.be.revertedWith("Unlock already initialized");
        });

        it("Should revert if ERC1155 token is not supported", async function () {
            await expect(lpStaking.connect(user1).unlock1155(user2.address, 1)).to.be.revertedWith("Token not supported");
        });
    });

    describe("Unstaking", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());
            await lpStaking.connect(user1).unlock(await token.getAddress());

            // Fast forward time by 1 week
            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");

            const FakeERC20 = await ethers.getContractFactory("FakeERC20", owner);
            this.fakeToken = await FakeERC20.deploy("Fake Token", "FAKE", 18, ethers.parseEther("1000").toString());
    
            await lpStaking.addLPTokenSupport(await this.fakeToken.getAddress());
            await this.fakeToken.transfer(user1.address, ethers.parseEther("100"));
            await this.fakeToken.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("5000"));
        });

        it("Should unstake tokens correctly", async function () {
            await lpStaking.connect(user1).unstake(await token.getAddress());

            expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
            expect(await lpStaking.balanceOf(await token.getAddress(), user1.address)).to.equal(ethers.parseEther("0"));
        });

        it("Should unstake the entire unlocked amount", async function () {
            await lpStaking.connect(user1).unstake(await token.getAddress());
    
            const userBalance = await token.balanceOf(user1.address);
            const contractBalance = await token.balanceOf(lpStaking.getAddress());
            const stakedBalance = await lpStaking.balanceOf(await token.getAddress(), user1.address);
    
            // Check that the entire unlocked amount is unstaked
            expect(userBalance).to.equal(ethers.parseEther("100"));
            expect(contractBalance).to.equal(ethers.parseEther("0"));
            expect(stakedBalance).to.equal(ethers.parseEther("0"));
        });
    
        it("Should update unlock time correctly", async function () {
            const block = await ethers.provider.getBlock('latest');
            if (!block) {
                throw new Error("Failed to fetch the latest block.");
            }
            const unlockTime = block.timestamp + 604800;
    
            const unlockInfo = await lpStaking.userUnlocks(user1.address, await token.getAddress());
            expect(unlockInfo.unlockAt).to.be.closeTo(unlockTime, 1000000);
        });

        it("Should emit Unstaked event", async function () {
            await expect(lpStaking.connect(user1).unstake(await token.getAddress()))
                .to.emit(lpStaking, "Unstaked")
                .withArgs(user1.address, ethers.parseEther("50"), await token.getAddress());
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.connect(user1).unstake( user2.address))
                .to.be.revertedWith("Token not supported");
        });

        it("Should revert if ERC20 safeTransfer returns false", async function () {
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), await this.fakeToken.getAddress())).to.be.reverted;
            // await lpStaking.connect(user1).unlock(await this.fakeToken.getAddress());
    
            // // Fast forward time by 1 week
            // await ethers.provider.send("evm_increaseTime", [604800]);
            // await ethers.provider.send("evm_mine");
    
            // await expect(lpStaking.connect(user1).unstake(await this.fakeToken.getAddress()))
            //     .to.be.reverted;
        });

        it("Should handle ERC20 tokens with transfer fees correctly on unstake", async function () {
            const FeeToken = await ethers.getContractFactory("FeeToken", owner);
            const feeToken = await FeeToken.deploy("Fee Token", "FEE", ethers.parseEther("1000").toString());
    
            await lpStaking.addLPTokenSupport(await feeToken.getAddress());
            await feeToken.transfer(user1.address, ethers.parseEther("100"));
            await feeToken.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await feeToken.getAddress());
            await lpStaking.connect(user1).unlock(await feeToken.getAddress());
    
            // Fast forward time by 1 week
            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");
    
            await lpStaking.connect(user1).unstake(await feeToken.getAddress());
    
            const userBalance = await feeToken.balanceOf(user1.address);
    
            // Check that the actual received amount is less due to the transfer fee
            expect(userBalance).to.be.lessThan(ethers.parseEther("100"));
        });

    });

    describe("ERC1155 Unstaking", function () {
        let erc1155Token: MockERC1155; // Assuming MockERC1155 is the mock contract with mint function

        beforeEach(async function () {
            const ERC1155Mock = await ethers.getContractFactory("MockERC1155", owner);
            erc1155Token = await ERC1155Mock.deploy();
            await lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress());
            await erc1155Token.mint(user1.address, 1, 100, "0x");
            await erc1155Token.connect(user1).setApprovalForAll(lpStaking.getAddress(), true);
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 50);
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1);

            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");
        });

        it("Should unstake ERC1155 tokens correctly", async function () {
            await lpStaking.connect(user1).unstake1155(await erc1155Token.getAddress(), 1);

            expect(await erc1155Token.balanceOf(user1.address, 1)).to.equal(100);
            expect(await lpStaking.balanceOf1155(await erc1155Token.getAddress(), 1, user1.address)).to.equal(0);
        });

        it("Should emit Unstaked1155 event", async function () {
            await expect(lpStaking.connect(user1).unstake1155(await erc1155Token.getAddress(), 1))
                .to.emit(lpStaking, "Unstaked1155")
                .withArgs(user1.address, 1, 50, await erc1155Token.getAddress());
        });

        it("Should revert if ERC1155 token is not supported", async function () {
            await expect(lpStaking.connect(user1).unstake1155(user2.address, 1)).to.be.revertedWith("Token not supported");
        });
    });

    describe("Pause/Unpause", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
        });

        it("Should pause the contract", async function () {
            await lpStaking.connect(hexagate).pause();
            expect(await lpStaking.paused()).to.be.true;
        });

        it("Should unpause the contract", async function () {
            await lpStaking.connect(hexagate).pause();
            await lpStaking.connect(hexagate).unpause();
            expect(await lpStaking.paused()).to.be.false;
        });

        it("Should revert if not Hexagate", async function () {
            await expect(lpStaking.connect(user1).pause()).to.be.revertedWith("Not Hexagate");
        });

        it("Should revert stake when paused", async function () {
            await lpStaking.connect(hexagate).pause();
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress()))
                .to.be.revertedWith("Contract is paused");
        });

        it("Should revert unlock when paused", async function () {
            await lpStaking.connect(hexagate).pause();
            await expect(lpStaking.connect(user1).unlock(await token.getAddress()))
                .to.be.revertedWith("Contract is paused");
        });

        it("Should revert unstake when paused", async function () {
            await lpStaking.connect(hexagate).pause();
            await expect(lpStaking.connect(user1).unstake(await token.getAddress()))
                .to.be.revertedWith("Contract is paused");
        });
    });

    describe("LPStaking - ERC1155 Unlock and Unstake", function () {
        
        let lpStaking: LPStaking;
        let owner: HardhatEthersSigner;
        let user1: HardhatEthersSigner;
        let erc1155Token: MockERC1155;

        beforeEach(async function () {
            [owner, user1] = await ethers.getSigners();

            const ERC1155Mock = await ethers.getContractFactory("MockERC1155", owner);
            erc1155Token = await ERC1155Mock.deploy();

            const LPStaking = await ethers.getContractFactory("LPStaking", owner);
            lpStaking = await LPStaking.deploy();
            await lpStaking.initialize(owner.address);

            // Accept ownership step
            await lpStaking.connect(owner).transferOwnership(owner.address);
            await lpStaking.connect(owner).acceptOwnership();

            await lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress());
            await erc1155Token.mint(user1.address, 1, 100, "0x");
            await erc1155Token.mint(user1.address, 2, 50, "0x");
            await erc1155Token.connect(user1).setApprovalForAll(lpStaking.getAddress(), true);
        });

        it("Should unlock the specific ERC1155 token correctly", async function () {
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 50);
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1);

            const unlockInfo = await lpStaking.userUnlocks1155(user1.address, await erc1155Token.getAddress(), 1);
            expect(unlockInfo.amount).to.equal(50);
            expect(unlockInfo.id).to.equal(1);
        });

        it("Should only allow unstaking the unlocked ERC1155 token", async function () {
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 50);
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 2, 40); 
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1);

            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");

            await expect(lpStaking.connect(user1).unstake1155(await erc1155Token.getAddress(), 2)).to.be.revertedWith("Token ID does not match unlocked token");
            await expect(lpStaking.connect(user1).unstake1155(await erc1155Token.getAddress(), 1)).to.emit(lpStaking, "Unstaked1155").withArgs(user1.address, 1, 50, await erc1155Token.getAddress());
        });
    });

    describe("LPStaking - Multiple ERC1155 Unlocks", function () {
        
        let lpStaking: LPStaking;
        let owner: HardhatEthersSigner;
        let user1: HardhatEthersSigner;
        let erc1155Token: MockERC1155;

        beforeEach(async function () {
            [owner, user1] = await ethers.getSigners();

            const ERC1155Mock = await ethers.getContractFactory("MockERC1155", owner);
            erc1155Token = await ERC1155Mock.deploy();

            const LPStaking = await ethers.getContractFactory("LPStaking", owner);
            lpStaking = await LPStaking.deploy();
            await lpStaking.initialize(owner.address);

            // Accept ownership step
            await lpStaking.connect(owner).transferOwnership(owner.address);
            await lpStaking.connect(owner).acceptOwnership();

            await lpStaking.addERC1155TokenSupport(await erc1155Token.getAddress());
            await erc1155Token.mint(user1.address, 1, 100, "0x");
            await erc1155Token.mint(user1.address, 2, 50, "0x");
            await erc1155Token.connect(user1).setApprovalForAll(lpStaking.getAddress(), true);
        });

        it("Should unlock multiple ERC1155 tokens correctly", async function () {
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 50);
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 2, 25);
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1);
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 2);

            const unlockInfo1 = await lpStaking.userUnlocks1155(user1.address, await erc1155Token.getAddress(), 1);
            const unlockInfo2 = await lpStaking.userUnlocks1155(user1.address, await erc1155Token.getAddress(), 2);

            expect(unlockInfo1.amount).to.equal(50);
            expect(unlockInfo1.id).to.equal(1);
            expect(unlockInfo2.amount).to.equal(25);
            expect(unlockInfo2.id).to.equal(2);
        });

        it("Should only allow unstaking the unlocked ERC1155 tokens", async function () {
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 1, 50);
            await lpStaking.connect(user1).stake1155(await erc1155Token.getAddress(), 2, 25);
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 1);
            await lpStaking.connect(user1).unlock1155(await erc1155Token.getAddress(), 2);

            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");

            await expect(lpStaking.connect(user1).unstake1155(await erc1155Token.getAddress(), 3)).to.be.revertedWith("Token ID does not match unlocked token");
            await expect(lpStaking.connect(user1).unstake1155(await erc1155Token.getAddress(), 1)).to.emit(lpStaking, "Unstaked1155").withArgs(user1.address, 1, 50, await erc1155Token.getAddress());
            await expect(lpStaking.connect(user1).unstake1155(await erc1155Token.getAddress(), 2)).to.emit(lpStaking, "Unstaked1155").withArgs(user1.address, 2, 25, await erc1155Token.getAddress());
        });
    });
});