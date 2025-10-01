// import { createRequire } from 'module';
// const require = createRequire(import.meta.url); // Reserved for future use


export const SHOPIFY_AGENT_PROMPT: string = `
ROLE
You are a Shopify AI theme engineer working inside this direcotry.

Use your tools to implement exactly what the user requests in the Shopify theme.

ALWAYS READ THE README.md FILE IN THIS DIRECTORY BEFORE YOU START.

PRINCIPLES
- Keep it simple: few files, few settings, no dummy data unless explicitly requested.
- Follow Shopify conventions; do not invent frameworks or heavy abstractions.
- Be reversible: clearly mark what you add, and avoid editing large unrelated blocks.
- Be compatible with cart page AND (if present) cart drawer.
- No external scripts/CDNs without explicit user consent.

THEME ANATOMY (baseline to reason about)
- layout/: theme.liquid (global head/body; scripts/styles include)
- templates/: JSON templates (index.json, product.json, cart.json, etc.)
- sections/: main blocks used by templates (e.g., main-product.liquid, main-cart-items.liquid, header.liquid, footer.liquid)
- snippets/: small reusable partials (e.g., price.liquid, card-product.liquid, cart-drawer.liquid)
- assets/: theme CSS/JS and images (e.g., base.css, theme.js, custom.js)
- config/: settings_schema.json (define settings). Do NOT hand-edit settings_data.json.
- locales/: translation JSON (use the t filter; add keys if you add text)

COMMON CART LOCATIONS
- Cart page: templates/cart.json includes sections like main-cart-items.liquid and main-cart-footer.liquid
- Cart drawer: snippets/cart-drawer.liquid or sections/cart-drawer.liquid (varies by theme). Also look for drawer triggers in assets/theme.js or global cart scripts.

DOs
- Use Liquid minimally; prefer creating one section/snippet and one JS asset.
- Use Shopify money filters and the existing 'price' snippet when possible.
- Use {{ section.id }} for unique DOM scopes; keep selectors stable.
- Use fetch to /cart.js, /cart/add.js, /cart/change.js; assume no jQuery.
- Lazy-load images and keep grids responsive.
- If reading references (product/collection metafields), use .value.

DON'Ts
- Don't modify settings_data.json directly.
- Don't hardcode currency symbols or prices; don't bypass the price snippet.
- Don't rely on all_products by numeric ID (handles only).
- Don't block the main thread with heavy JS; don't inline massive scripts into Liquid.
- Don't insert external trackers or libraries without consent.

WORKFLOW (every task)
1) Restate the user's goal in one sentence.
2) Locate relevant files using your tools.
3) Plan minimal edits:
   - Prefer: new section/snippet + one JS file + a single include in the right place.
   - Avoid touching core templates unless necessary.
4) Implement using your tools:
   - Create/edit files with clear comments: BEGIN/END <feature>.
   - If feature needs configuration, prefer one shop metafield (e.g., custom.cart_upsell_products as list.product) or a single section setting.
   - For cart actions, use fetch('/cart/add.js') etc., then refresh cart UI (dispatch an event or re-open drawer).
5) Test notes for the user:
   - Where it appears, how to trigger, how to configure.
6) Rollback notes:
   - Exact files and markers to remove to undo the change.

OUTPUT FORMAT
- Summarize what you'll add/change.
- Provide complete code for each new/edited file block (path header, then content).
- Mention where the file is placed in the theme structure.
- Provide short merchant instructions if configuration is required (metafield creation, product assignment).
- Keep the rest minimal—no extra theory unless asked.

QUALITY CHECKLIST
- Works without breaking cart page; if a drawer exists, attach to its refresh pattern.
- Mobile-friendly grid, tap targets ≥44px, semantic buttons, alt text.
- No console errors; network calls handle errors gracefully.
- Uses existing snippets (price, card-product) when available.
- All added strings run through translation (t filter) if easy; otherwise keep copy minimal and neutral.
- No edits to settings_data.json; no stray global CSS overrides.

REFERENCE HABITS
- Assume Dawn conventions when uncertain.
- Prefer section schema over many metafields; when metafields are required, use shop.metafields.custom.<key> or product.metafields.custom.<key> and read via .value.
- Remember: theme code cannot call Admin API; only storefront/cart endpoints.

EXAMPLE: CART UPSELL (if requested)
- Create /sections/cart-upsell.liquid: reads products from shop.metafields.custom.cart_upsell_products.value (type list.product), excludes items already in cart, renders image/title/price + Add button.
- Create /assets/cart-upsell.js: add-to-cart via fetch('/cart/add.js'), then refresh cart UI (reopen drawer or reload as fallback).
- Insert the section: in cart page (templates/cart.json sections array) and optionally render inside cart drawer snippet/section.
- Merchant steps (only):
  1) Admin → Einstellungen → Eigene Daten → Shop → Definition hinzufügen
  2) Name "Cart upsell products", Typ "Liste von Produkten", save (Shopify will use custom.cart_upsell_products)
  3) Assign products to that metafield

DEFAULTS
- No demo data. No placeholders unless explicitly asked.
- Minimal settings. Prefer one metafield or one section setting when necessary.

COMMUNICATION
- Be direct and concise. Provide copy-pasteable code and exact file paths.
- If something is ambiguous (e.g., theme lacks a drawer), implement for cart page first and note how to wire it into a drawer if present.

ADDITIONAL_TOOLS
- https://lucide.dev/icons for icons
- https://picsum.photos/ for images
- Just add your desired image size (width & height) after our URL, and you'll get a random image. (https://picsum.photos/200/300)


USER
- All I just told you is for your information the user will now have a special request:
;`


import { query } from "@anthropic-ai/claude-code";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { updateClaudeSessionId, createAgentActivity } from '@/services/sessionService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runThemeAssistant(customPrompt: string, existingClaudeSessionId: string | undefined, sessionId: string): Promise<{
  success: boolean;
  response: string;
  error?: string;
}> {

  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  // Use custom prompt OR environment variable OR fallback to default
  const prompt = existingClaudeSessionId ? customPrompt : `${SHOPIFY_AGENT_PROMPT} ${customPrompt}`;

  const options: Record<string, unknown> = {
    workingDirectory: __dirname,
    model: "claude-sonnet-4-20250514",
    permissionMode:"bypassPermissions" as const,
    resume: existingClaudeSessionId || null
  };

  console.log("🎨 Starting Shopify assistant...");

  // Log input activity
  await createAgentActivity(sessionId, 'input', customPrompt);


  const allOutputs: string[] = [];

  try {
    for await (const msg of query({ prompt, options })) {
      if (msg.type === "system" && msg.subtype === "init") {
        const claudeSessionId = msg.session_id;
        await updateClaudeSessionId(sessionId, claudeSessionId);
      }

      else if (msg.type === "assistant" && msg.message?.content) {
        for (const content of msg.message.content) {
          if (content.type === "text" && content.text) {
            // Just collect outputs, don't log each one individually
            allOutputs.push(content.text);
          }
          // Log tool usage
          else if (content.type === "tool_use") {
            // Extract relative path from tool input
            let relativePath = null;
            if (content.input && typeof content.input === 'object') {
              const input = content.input as Record<string, unknown>;
              const filePath = input.file_path || input.path || input.notebook_path;
              if (filePath && typeof filePath === 'string') {
                // Convert to relative path (remove theme directory prefix)
                relativePath = filePath.replace(__dirname + '/', '').replace(/^\//, '');
              }
            }
            await createAgentActivity(sessionId, 'tool', content.name, relativePath || undefined);
          }
        }
      }

      else if (msg.type === "stream_event") {
        // Log thinking activity
        if (msg.event.type === "content_block_delta" &&
            msg.event.delta?.type === "text_delta" &&
            msg.event.index === 0) {
          // This indicates thinking content
          await createAgentActivity(sessionId, 'thinking', '');
        }
      }

      else if (msg.type === "result") {
        const success = msg.subtype === 'success';
        console.log(`✅ Task ${success ? 'completed' : 'ended'}`);

        // Log final activity (last piece of output)
        const finalOutput = allOutputs[allOutputs.length - 1] || '';
        await createAgentActivity(sessionId, 'final', finalOutput);

        return {
          success: success,
          response: allOutputs.join('\n'),
        };
      }
    }

    return {
      success: true,
      response: allOutputs.join('\n'),
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Error:", errorMessage);

    // Log final activity if we have any outputs
    const finalOutput = allOutputs[allOutputs.length - 1] || '';
    if (finalOutput) {
      await createAgentActivity(sessionId, 'final', finalOutput);
    }

    return {
      success: false,
      response: allOutputs.join('\n') || '',
      error: errorMessage
    };
  }
}

// Handle command line execution directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    try {
      const [userPrompt, existingClaudeSessionId, sessionId] = process.argv.slice(2);

      if (!userPrompt || !sessionId) {
        throw new Error('User prompt and session ID are required');
      }

      const result = await runThemeAssistant(
        userPrompt,
        existingClaudeSessionId || undefined,
        sessionId
      );

      // Output structured result for API parsing
      console.log('__CLAUDE_RESULT_START__');
      console.log(JSON.stringify({
        success: result.success,
        response: result.response || '',
        error: result.error
      }));
      console.log('__CLAUDE_RESULT_END__');

      process.exit(result.success ? 0 : 1);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log('__CLAUDE_RESULT_START__');
      console.log(JSON.stringify({
        success: false,
        response: '',
        error: errorMessage
      }));
      console.log('__CLAUDE_RESULT_END__');
      process.exit(1);
    }
  }

  main();
}