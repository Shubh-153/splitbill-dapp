// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SplitBill
/// @notice A trustless expense splitter. Someone fronts a group expense,
///         creates a "bill" listing who owes what, and each participant
///         pays their own share directly into the contract, which forwards
///         it straight to whoever fronted the money. No middleman ever
///         holds the funds, and every payment is publicly verifiable.
contract SplitBill {
    struct BillCore {
        address payer; // the person who fronted the money and should be reimbursed
        string description; // e.g. "Dinner at Cafe X"
        uint256 totalAmount; // sum of all participant shares
        uint256 amountCollected; // running total paid in so far
        bool settled; // true once amountCollected == totalAmount
        bool exists;
    }

    uint256 public billCount;

    mapping(uint256 => BillCore) public bills;
    mapping(uint256 => address[]) private billParticipants;
    mapping(uint256 => mapping(address => uint256)) public shareOwed;
    mapping(uint256 => mapping(address => bool)) public hasPaid;

    event BillCreated(
        uint256 indexed billId,
        address indexed payer,
        string description,
        uint256 totalAmount,
        address[] participants,
        uint256[] shares
    );
    event SharePaid(uint256 indexed billId, address indexed participant, uint256 amount);
    event BillSettled(uint256 indexed billId, uint256 totalAmount);

    modifier billExists(uint256 billId) {
        require(bills[billId].exists, "SplitBill: bill does not exist");
        _;
    }

    /// @notice Create a new bill. The caller becomes the "payer" who will be
    ///         reimbursed as participants pay their share.
    /// @param description Human-readable label for the bill.
    /// @param participants Wallet addresses who each owe a share (payer should NOT be included).
    /// @param shares Amount (in wei) each corresponding participant owes.
    function createBill(
        string calldata description,
        address[] calldata participants,
        uint256[] calldata shares
    ) external returns (uint256 billId) {
        require(participants.length > 0, "SplitBill: need at least one participant");
        require(participants.length == shares.length, "SplitBill: participants/shares length mismatch");

        uint256 total = 0;
        for (uint256 i = 0; i < participants.length; i++) {
            require(participants[i] != address(0), "SplitBill: zero address participant");
            require(participants[i] != msg.sender, "SplitBill: payer cannot also be a participant");
            require(shares[i] > 0, "SplitBill: share must be > 0");
            total += shares[i];
        }

        billId = billCount++;

        bills[billId] = BillCore({
            payer: msg.sender,
            description: description,
            totalAmount: total,
            amountCollected: 0,
            settled: false,
            exists: true
        });

        billParticipants[billId] = participants;
        for (uint256 i = 0; i < participants.length; i++) {
            shareOwed[billId][participants[i]] = shares[i];
        }

        emit BillCreated(billId, msg.sender, description, total, participants, shares);
    }

    /// @notice Pay your share of a bill. Funds are forwarded immediately to the payer.
    function payShare(uint256 billId) external payable billExists(billId) {
        BillCore storage bill = bills[billId];
        require(!bill.settled, "SplitBill: bill already settled");

        uint256 owed = shareOwed[billId][msg.sender];
        require(owed > 0, "SplitBill: caller is not a participant on this bill");
        require(!hasPaid[billId][msg.sender], "SplitBill: share already paid");
        require(msg.value == owed, "SplitBill: must send exact share amount");

        hasPaid[billId][msg.sender] = true;
        bill.amountCollected += msg.value;

        emit SharePaid(billId, msg.sender, msg.value);

        (bool success, ) = payable(bill.payer).call{value: msg.value}("");
        require(success, "SplitBill: transfer to payer failed");

        if (bill.amountCollected == bill.totalAmount) {
            bill.settled = true;
            emit BillSettled(billId, bill.totalAmount);
        }
    }

    /// @notice Full participant list for a bill.
    function getParticipants(uint256 billId) external view billExists(billId) returns (address[] memory) {
        return billParticipants[billId];
    }

    /// @notice Convenience view returning everything the frontend needs at once.
    function getBillDetails(uint256 billId)
        external
        view
        billExists(billId)
        returns (
            address payer,
            string memory description,
            uint256 totalAmount,
            uint256 amountCollected,
            bool settled,
            address[] memory participants,
            uint256[] memory shares,
            bool[] memory paidStatus
        )
    {
        BillCore storage bill = bills[billId];
        address[] memory parts = billParticipants[billId];
        uint256[] memory sharesArr = new uint256[](parts.length);
        bool[] memory paidArr = new bool[](parts.length);

        for (uint256 i = 0; i < parts.length; i++) {
            sharesArr[i] = shareOwed[billId][parts[i]];
            paidArr[i] = hasPaid[billId][parts[i]];
        }

        return (
            bill.payer,
            bill.description,
            bill.totalAmount,
            bill.amountCollected,
            bill.settled,
            parts,
            sharesArr,
            paidArr
        );
    }
}
