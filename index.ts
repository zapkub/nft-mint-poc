import * as fs from "fs";
import { Program, web3 } from "@project-serum/anchor";
import {
  Commitment,
  Connection,
  Keypair,
  SignatureStatus,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import { AccountLayout, MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import log from "loglevel";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getUnixTs = () => {
  return new Date().getTime() / 1000;
};

async function awaitTransactionSignatureConfirmation(
  txid: TransactionSignature,
  timeout: number,
  connection: Connection,
  commitment: Commitment = "recent",
  queryStatus = false,
): Promise<SignatureStatus | null | void> {
  let done = false;
  let status: SignatureStatus | null | void = {
    slot: 0,
    confirmations: 0,
    err: null,
  };
  let subId = 0;
  // eslint-disable-next-line no-async-promise-executor
  status = await new Promise(async (resolve, reject) => {
    setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      log.warn("Rejecting for timeout...");
      reject({ timeout: true });
    }, timeout);
    try {
      subId = connection.onSignature(
        txid,
        (result, context) => {
          done = true;
          status = {
            err: result.err,
            slot: context.slot,
            confirmations: 0,
          };
          if (result.err) {
            log.warn("Rejected via websocket", result.err);
            reject(status);
          } else {
            log.debug("Resolved via websocket", result);
            resolve(status);
          }
        },
        commitment,
      );
    } catch (e) {
      done = true;
      log.error("WS error in setup", txid, e);
    }
    while (!done && queryStatus) {
      // eslint-disable-next-line no-loop-func
      (async () => {
        try {
          const signatureStatuses = await connection.getSignatureStatuses([
            txid,
          ]);
          status = signatureStatuses && signatureStatuses.value[0];
          if (!done) {
            if (!status) {
              log.debug("REST null result for", txid, status);
            } else if (status.err) {
              log.error("REST error for", txid, status);
              done = true;
              reject(status.err);
            } else if (!status.confirmations) {
              log.error("REST no confirmations for", txid, status);
            } else {
              log.debug("REST confirmation for", txid, status);
              done = true;
              resolve(status);
            }
          }
        } catch (e) {
          if (!done) {
            log.error("REST connection error: txid", txid, e);
          }
        }
      })();
      await sleep(2000);
    }
  });

  //@ts-ignore
  if (connection._signatureSubscriptions[subId]) {
    connection.removeSignatureListener(subId);
  }
  done = true;
  log.debug("Returning status", status);
  return status;
}

export const DEFAULT_TIMEOUT = 15000;

async function start() {
  const solConnection = new web3.Connection(web3.clusterApiUrl("devnet"));

  const secretKeyString = await fs.readFileSync(
    "/Users/zdcdos/.config/solana/id.json",
    { encoding: "utf8" },
  );
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const wallet = web3.Keypair.fromSecretKey(secretKey);

  const account = Keypair.generate();

  const mintRent = await solConnection.getMinimumBalanceForRentExemption(
    MintLayout.span,
  );

  const instructions: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: mintRent,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),

    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      account.publicKey,
      0,
      wallet.publicKey,
      wallet.publicKey,
    ),
  ];
  const signers: Keypair[] = [wallet, account];

  const transaction = new Transaction();

  instructions.forEach((instruction) => transaction.add(instruction));
  transaction.recentBlockhash =
    (await solConnection.getRecentBlockhash("singleGossip")).blockhash;
  transaction.sign(...signers);

  const rawTransaction = transaction.serialize();
  const txid = await solConnection.sendRawTransaction(rawTransaction, {
    skipPreflight: true,
  });
  const startTime = getUnixTs();

  let done = false;
  // (async () => {
  //   while (!done && getUnixTs() - startTime < DEFAULT_TIMEOUT) {
  //       solConnection.sendRawTransaction(rawTransaction, {skipPreflight: true});
  //   }
  //   await sleep(500);
  // })();

  try {
    const confirmation = await awaitTransactionSignatureConfirmation(
      txid,
      DEFAULT_TIMEOUT,
      solConnection,
      "confirmed",
      true,
    );

    if (!confirmation) {
      throw new Error("Timed out awaiting confirmation on transaction");
    }

    if (confirmation.err) {
      log.error(confirmation.err);
      throw new Error("Transaction failed: Custom instruction error");
    }
  } catch (e) {
    log.error(e)
  } finally {
    done = true;
  }

  log.info("txid: ", txid);
}

start();
