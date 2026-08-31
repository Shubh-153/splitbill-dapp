// Manual compile step that bypasses Hardhat's built-in compiler downloader
// (which needs network access to binaries.soliditylang.org). We use the
// `solc` npm package instead, which is fetched from the npm registry, and
// write out artifacts in the exact format Hardhat expects so that
// `hardhat test` / `hardhat run` / hardhat-ethers all work normally.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const contractsDir = path.join(__dirname, "..", "contracts");
const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");
const cacheDir = path.join(__dirname, "..", "cache");

function findSolFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sol"));
}

function compileFile(fileName) {
  const fullPath = path.join(contractsDir, fileName);
  const source = fs.readFileSync(fullPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      [fileName]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    let hasError = false;
    for (const err of output.errors) {
      console.log(err.formattedMessage || err.message);
      if (err.severity === "error") hasError = true;
    }
    if (hasError) {
      throw new Error(`Compilation failed for ${fileName}`);
    }
  }

  const contractsOut = output.contracts[fileName];
  const outDir = path.join(artifactsDir, fileName);
  fs.mkdirSync(outDir, { recursive: true });

  for (const contractName of Object.keys(contractsOut)) {
    const c = contractsOut[contractName];
    const artifact = {
      _format: "hh-sol-artifact-1",
      contractName,
      sourceName: fileName,
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
      linkReferences: c.evm.bytecode.linkReferences || {},
      deployedLinkReferences: c.evm.deployedBytecode.linkReferences || {},
    };
    fs.writeFileSync(
      path.join(outDir, `${contractName}.json`),
      JSON.stringify(artifact, null, 2)
    );

    const dbg = {
      _format: "hh-sol-dbg-1",
      buildInfo: "../../../build-info/dummy.json",
    };
    fs.writeFileSync(
      path.join(outDir, `${contractName}.dbg.json`),
      JSON.stringify(dbg, null, 2)
    );

    console.log(`Compiled ${contractName} -> artifacts/contracts/${fileName}/${contractName}.json`);
  }
}

function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const files = findSolFiles(contractsDir);
  if (files.length === 0) {
    console.log("No .sol files found in contracts/");
    return;
  }
  for (const file of files) {
    compileFile(file);
  }
  console.log("\nDone. You can now run: npx hardhat test --no-compile");
}

main();
