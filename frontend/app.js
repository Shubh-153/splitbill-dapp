// ====== CONFIGURE THIS AFTER DEPLOYING THE CONTRACT ======
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
// ===========================================================

let provider, signer, contract, currentAccount;

const connectBtn = document.getElementById("connectBtn");
const accountLabel = document.getElementById("accountLabel");
const networkLabel = document.getElementById("networkLabel");
const createForm = document.getElementById("createForm");
const billsList = document.getElementById("billsList");
const statusBox = document.getElementById("statusBox");
const refreshBtn = document.getElementById("refreshBtn");

function setStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.className = isError ? "status error" : "status";
}

async function connectWallet() {
  if (!window.ethereum) {
    setStatus("MetaMask (or another injected wallet) not found. Please install it.", true);
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    currentAccount = await signer.getAddress();
    const network = await provider.getNetwork();

    if (CONTRACT_ADDRESS.startsWith("PASTE_")) {
      setStatus("Set CONTRACT_ADDRESS in frontend/app.js after deploying the contract.", true);
      return;
    }

    contract = new ethers.Contract(CONTRACT_ADDRESS, SPLITBILL_ABI, signer);

    accountLabel.textContent = `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`;
    networkLabel.textContent = `Network: ${network.name} (chainId ${network.chainId})`;
    connectBtn.textContent = "Connected";
    connectBtn.disabled = true;

    setStatus("Wallet connected. Loading bills...");
    await loadBills();
    setStatus("Ready.");
  } catch (err) {
    console.error(err);
    setStatus(`Connection failed: ${err.message || err}`, true);
  }
}

async function createBill(event) {
  event.preventDefault();
  if (!contract) {
    setStatus("Connect your wallet first.", true);
    return;
  }

  const description = document.getElementById("description").value.trim();
  const participantsRaw = document.getElementById("participants").value.trim();
  const sharesRaw = document.getElementById("shares").value.trim();

  const participants = participantsRaw.split(",").map((a) => a.trim()).filter(Boolean);
  const shareStrings = sharesRaw.split(",").map((a) => a.trim()).filter(Boolean);

  if (participants.length === 0 || participants.length !== shareStrings.length) {
    setStatus("Participants and shares must be comma-separated lists of the same length.", true);
    return;
  }

  try {
    const shares = shareStrings.map((s) => ethers.parseEther(s));
    setStatus("Sending createBill transaction... confirm in your wallet.");
    const tx = await contract.createBill(description, participants, shares);
    await tx.wait();
    setStatus(`Bill "${description}" created!`);
    createForm.reset();
    await loadBills();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to create bill: ${err.reason || err.message || err}`, true);
  }
}

async function payShare(billId, amountWei) {
  try {
    setStatus(`Paying your share for bill #${billId}... confirm in your wallet.`);
    const tx = await contract.payShare(billId, { value: amountWei });
    await tx.wait();
    setStatus(`Paid your share for bill #${billId}!`);
    await loadBills();
  } catch (err) {
    console.error(err);
    setStatus(`Payment failed: ${err.reason || err.message || err}`, true);
  }
}

function billCard(billId, details) {
  const {
    payer,
    description,
    totalAmount,
    amountCollected,
    settled,
    participants,
    shares,
    paidStatus,
  } = details;

  const card = document.createElement("div");
  card.className = "card" + (settled ? " settled" : "");

  const title = document.createElement("h3");
  title.textContent = `#${billId} — ${description}`;
  card.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `Fronted by ${payer.slice(0, 6)}...${payer.slice(-4)} | Total: ${ethers.formatEther(totalAmount)} ETH | Collected: ${ethers.formatEther(amountCollected)} ETH${settled ? " | SETTLED ✅" : ""}`;
  card.appendChild(meta);

  const list = document.createElement("ul");
  participants.forEach((addr, i) => {
    const li = document.createElement("li");
    const paid = paidStatus[i];
    const shareAmount = shares[i];
    const isMe = currentAccount && addr.toLowerCase() === currentAccount.toLowerCase();

    li.textContent = `${addr.slice(0, 6)}...${addr.slice(-4)} owes ${ethers.formatEther(shareAmount)} ETH — ${paid ? "PAID ✅" : "unpaid"}`;

    if (isMe && !paid && !settled) {
      const payBtn = document.createElement("button");
      payBtn.textContent = "Pay my share";
      payBtn.onclick = () => payShare(billId, shareAmount);
      li.appendChild(payBtn);
    }
    list.appendChild(li);
  });
  card.appendChild(list);

  return card;
}

async function loadBills() {
  if (!contract) return;
  billsList.innerHTML = "";
  const count = await contract.billCount();
  const total = Number(count);

  if (total === 0) {
    billsList.innerHTML = "<p class='meta'>No bills yet. Create one above.</p>";
    return;
  }

  for (let i = total - 1; i >= 0; i--) {
    const details = await contract.getBillDetails(i);
    billsList.appendChild(billCard(i, details));
  }
}

connectBtn.addEventListener("click", connectWallet);
createForm.addEventListener("submit", createBill);
refreshBtn.addEventListener("click", loadBills);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}
