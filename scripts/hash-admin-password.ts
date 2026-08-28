import { hash } from "bcryptjs";

async function main() {
  const password = process.argv[2];
  if (!password || password.length < 12) {
    console.error("Informe uma senha com pelo menos 12 caracteres.");
    process.exitCode = 1;
    return;
  }
  console.info(await hash(password, 12));
}

void main();
