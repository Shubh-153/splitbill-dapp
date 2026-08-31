const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SplitBill", function () {
  let splitBill;
  let payer, alice, bob, carol, outsider;

  beforeEach(async function () {
    [payer, alice, bob, carol, outsider] = await ethers.getSigners();
    const SplitBill = await ethers.getContractFactory("SplitBill");
    splitBill = await SplitBill.deploy();
    await splitBill.waitForDeployment();
  });

  async function createSampleBill() {
    const participants = [alice.address, bob.address, carol.address];
    const shares = [
      ethers.parseEther("0.1"),
      ethers.parseEther("0.2"),
      ethers.parseEther("0.3"),
    ];
    const tx = await splitBill.connect(payer).createBill("Dinner", participants, shares);
    await tx.wait();
    return { participants, shares, billId: 0 };
  }

  it("creates a bill with correct total and details", async function () {
    const { billId } = await createSampleBill();
    const details = await splitBill.getBillDetails(billId);

    expect(details.payer).to.equal(payer.address);
    expect(details.description).to.equal("Dinner");
    expect(details.totalAmount).to.equal(ethers.parseEther("0.6"));
    expect(details.amountCollected).to.equal(0);
    expect(details.settled).to.equal(false);
    expect(details.participants.length).to.equal(3);
  });

  it("rejects mismatched participants/shares arrays", async function () {
    await expect(
      splitBill.connect(payer).createBill("Bad bill", [alice.address], [])
    ).to.be.revertedWith("SplitBill: participants/shares length mismatch");
  });

  it("rejects the payer trying to also be a participant", async function () {
    await expect(
      splitBill.connect(payer).createBill(
        "Bad bill",
        [payer.address],
        [ethers.parseEther("0.1")]
      )
    ).to.be.revertedWith("SplitBill: payer cannot also be a participant");
  });

  it("lets a participant pay their exact share, forwarding it to the payer", async function () {
    const { billId } = await createSampleBill();

    const payerBalanceBefore = await ethers.provider.getBalance(payer.address);

    await expect(
      splitBill.connect(alice).payShare(billId, { value: ethers.parseEther("0.1") })
    )
      .to.emit(splitBill, "SharePaid")
      .withArgs(billId, alice.address, ethers.parseEther("0.1"));

    const payerBalanceAfter = await ethers.provider.getBalance(payer.address);
    expect(payerBalanceAfter - payerBalanceBefore).to.equal(ethers.parseEther("0.1"));

    expect(await splitBill.hasPaid(billId, alice.address)).to.equal(true);
  });

  it("rejects paying the wrong amount", async function () {
    const { billId } = await createSampleBill();
    await expect(
      splitBill.connect(alice).payShare(billId, { value: ethers.parseEther("0.05") })
    ).to.be.revertedWith("SplitBill: must send exact share amount");
  });

  it("rejects a non-participant trying to pay", async function () {
    const { billId } = await createSampleBill();
    await expect(
      splitBill.connect(outsider).payShare(billId, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("SplitBill: caller is not a participant on this bill");
  });

  it("rejects paying twice", async function () {
    const { billId } = await createSampleBill();
    await splitBill.connect(alice).payShare(billId, { value: ethers.parseEther("0.1") });
    await expect(
      splitBill.connect(alice).payShare(billId, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("SplitBill: share already paid");
  });

  it("marks the bill settled once everyone has paid", async function () {
    const { billId } = await createSampleBill();

    await splitBill.connect(alice).payShare(billId, { value: ethers.parseEther("0.1") });
    await splitBill.connect(bob).payShare(billId, { value: ethers.parseEther("0.2") });

    let details = await splitBill.getBillDetails(billId);
    expect(details.settled).to.equal(false);

    await expect(
      splitBill.connect(carol).payShare(billId, { value: ethers.parseEther("0.3") })
    )
      .to.emit(splitBill, "BillSettled")
      .withArgs(billId, ethers.parseEther("0.6"));

    details = await splitBill.getBillDetails(billId);
    expect(details.settled).to.equal(true);
    expect(details.amountCollected).to.equal(ethers.parseEther("0.6"));
  });

  it("rejects paying into a bill that does not exist", async function () {
    await expect(
      splitBill.connect(alice).payShare(99, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("SplitBill: bill does not exist");
  });
});
