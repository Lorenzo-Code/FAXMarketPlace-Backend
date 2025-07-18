await logAudit({
  event: "TOKEN_TRANSFER",
  userId: req.user.id,
  role: req.user.role,
  meta: {
    token: "FCT",
    amount: 500,
    to: recipientId,
    txHash: result.txHash,
  },
});
