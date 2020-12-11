import { Lordless, Transfer, Approval, MinterAdded, MinterRemoved } from "../generated/Lordless/Lordless";

import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

import {
  Transfer as TransferEntity,
  _Approval as ApprovalEntity,
  Minter,
	Balance,
  Token,
	TokenSupply,
	_LastTokenSupply,
} from "../generated/schema";

export function handleMinterAdded(event: MinterAdded): void {
  let entity = Minter.load(event.params.account.toHex())

  if (entity == null) {
    entity = new Minter(event.params.account.toHex())
  }

  entity.save()
}

export function handleApproval(event: Approval): void {
  let entity = ApprovalEntity.load(event.params.owner.toHex())

  if (entity == null) {
    entity = new ApprovalEntity(event.params.owner.toHex())
  }

  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value
  entity.save()
}

function initToken(
	tokenId: string,
	tokenSupplyId: string,
	totalSupplyVal: BigDecimal,
	event: Transfer,
	token: Token | null
): void {
	token = new Token(tokenId);
	token.save();
	let prevTokenSupply = new _LastTokenSupply(tokenId);
	saveTokenSupply(
		tokenSupplyId,
		totalSupplyVal,
		event,
		token,
		prevTokenSupply
	);
}

function initBalance(address: string): void {
	let balance = Balance.load(address);
	if (balance === null && !address.startsWith("0x000000")) {
		balance = new Balance(address);
		balance.amount = BigDecimal.fromString("0");
		balance.save();
	}
}

function saveTokenSupply(
	tokenSupplyId: string,
	totalSupplyVal: BigDecimal,
	event: Transfer,
	token: Token | null,
	prevTokenSupply: _LastTokenSupply | null
): void {
	// record totalSupply changes
	let tokenSupply = new TokenSupply(tokenSupplyId);
	tokenSupply.totalSupply = totalSupplyVal;
	tokenSupply.timestamp = event.block.timestamp;
	tokenSupply.token = token.id;
	tokenSupply.save();
	prevTokenSupply.totalSupply = totalSupplyVal;
	prevTokenSupply.save();
}

function saveTransaction(
	transferId: string,
	fromAddress: string,
	toAddress: string,
	transferAmount: BigDecimal,
	timestamp: BigInt
): void {
	let transfer = new TransferEntity(transferId);
	transfer.from = fromAddress;
	transfer.to = toAddress;
	transfer.amount = transferAmount;
	transfer.timestamp = timestamp;

	transfer.save();
}

function saveBalance(
	fromAddress: string,
	toAddress: string,
	transferAmount: BigDecimal
): void {
	initBalance(fromAddress);
	initBalance(toAddress);

	let fromBalance = Balance.load(fromAddress);
	let toBalance = Balance.load(toAddress);

	if (fromBalance !== null) {
		fromBalance.amount = fromBalance.amount.minus(transferAmount);
		fromBalance.save();
	}
	if (toBalance !== null) {
		toBalance.amount = toBalance.amount.plus(transferAmount);
		toBalance.save();
	}
}

export function handleTransfer(event: Transfer): void {
	let contract = Lordless.bind(event.address);
	let totalSupplyVal: BigDecimal;
	let tokenId = event.address.toHex();
	let fromAddress = event.params.from.toHex();
	let toAddress = event.params.to.toHex();

	let totalSupply = contract.totalSupply();
	let decimals = contract.decimals();
	let decimalsTotal = toDecimalExponent(BigInt.fromI32(decimals));
	let decimalTotalSupply = convertToDecimal(totalSupply, decimalsTotal);
	totalSupplyVal = decimalTotalSupply;
	let transferAmount = convertToDecimal(event.params.value, decimalsTotal);
	let timestamp = event.block.timestamp;

	let token = Token.load(tokenId);
	let transferId = event.transaction.hash.toHex();

	if (!token) {
		initToken(tokenId, transferId, totalSupplyVal, event, token);
	} else {
		let prevTokenSupply = _LastTokenSupply.load(tokenId);

		if (prevTokenSupply.totalSupply != totalSupplyVal) {
			saveTokenSupply(
				transferId,
				totalSupplyVal,
				event,
				token,
				prevTokenSupply
			);
		}
	}

	saveTransaction(
		transferId,
		fromAddress,
		toAddress,
		transferAmount,
		timestamp
	);

	saveBalance(fromAddress, toAddress, transferAmount);
}

function toDecimalExponent(decimals: BigInt): BigInt {
	let decimalTotal = BigInt.fromI32(10);
	for (
		let i = BigInt.fromI32(1);
		i.lt(decimals);
		i = i.plus(BigInt.fromI32(1))
	) {
		decimalTotal = decimalTotal.times(BigInt.fromI32(10));
	}
	return decimalTotal;
}

function convertToDecimal(
	amount: BigInt,
	decimalTotal: BigInt
): BigDecimal {
	return amount.toBigDecimal().div(decimalTotal.toBigDecimal());
}
