import 'dotenv/config';
import { TaskClient, textPart, decodeInlineArtifact } from '@blocks-network/sdk';
import type { ArtifactEvent, ProgressEvent } from '@blocks-network/sdk';

/**
 * Sends a "hide" task to the decodedly agent, then a "reveal" task using the
 * resulting key, and confirms the secret round-trips correctly.
 * Usage: npx tsx trigger.ts   (or: docker compose exec decodedly npx tsx trigger.ts)
 */

const SECRET = "Hi...now go away! Thanks";
const COVER = 'Hi, how are you today? I think that this is great!';

async function sendTask(client: TaskClient, mode: string, payload: Record<string, unknown>): Promise<string> {
  const session = await client.sendMessage({
    agentName: 'decodedly',
    requestParts: [textPart(JSON.stringify({ mode, ...payload }), 'request')],
  });

  console.log(`\nTask created [${mode}]:`, session.taskId);

  let result = '';
  session.onProgress((event: ProgressEvent) => {
    console.log('  [progress]', event.message ?? event.progress ?? '');
  });
  session.onArtifact(async (event: ArtifactEvent) => {
    const ref = event.artifactRef;
    const bytes =
      ref.kind === 'inline' && ref.data
        ? decodeInlineArtifact(ref)
        : (await session.downloadArtifact(ref)).data;
    result = new TextDecoder().decode(bytes);
    console.log('  [artifact]', result);
  });

  const terminal = await session.waitForTerminal(30_000);
  console.log('  [done]', terminal.state);
  session.close();

  if (terminal.state !== 'completed') {
    throw new Error(`Task ${session.taskId} ended in state "${terminal.state}"`);
  }
  return result;
}

async function main() {
  const client = await TaskClient.create({
    billingMode: 'free',
    apiKey: process.env.BLOCKS_API_KEY!,
  });

  const hideResultRaw = await sendTask(client, 'hide', {
    secretMessage: SECRET,
    coverText: COVER,
  });
  const { key } = JSON.parse(hideResultRaw) as { key: string };

  const revealed = await sendTask(client, 'reveal', {
    coverText: COVER,
    key,
  });

  console.log('\nRound trip:', revealed === SECRET ? 'OK ✅' : `MISMATCH ❌ (got: "${revealed}")`);

  client.destroy();
  process.exit(revealed === SECRET ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
