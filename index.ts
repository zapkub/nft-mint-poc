import * as fs from "fs";
import { Program, web3 } from "@project-serum/anchor";
import { Keypair, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function start() {

  const solConnection = new web3.Connection(web3.clusterApiUrl('devnet'))
  
  const secretKeyString = await fs.readFileSync(
    "/Users/zdcdos/.config/solana/id.json",
    { encoding: "utf8" },
  );
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const wallet = web3.Keypair.fromSecretKey(secretKey);
 
  const account = Keypair.generate();
  
  const instructions: TransactionInstruction[] = [
      SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: account.publicKey,
            lamports: 50,
            space: AccountLayout.span,
            programId: TOKEN_PROGRAM_ID,
      })
  ];
  const signers: Keypair[] = [account] 

}

start();
