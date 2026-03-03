/**
 * Code snippet generation for each supported client stack.
 *
 * Every snippet shows the gateway URL in place of the Supabase project URL.
 * Users still supply their original Supabase anon key — the gateway forwards
 * requests transparently and only the URL changes.
 */

export const SUPPORTED_STACKS = [
  "supabase-js",
  "nextjs",
  "vite",
  "node",
  "python",
  "flutter",
  "expo",
  "emergent",
  "lovable",
  "other",
] as const;

export type Stack = (typeof SUPPORTED_STACKS)[number];

// ── Individual snippet builders ────────────────────────────────────────────────

const builders: Record<Stack, (url: string) => string> = {
  "supabase-js": (url) =>
    `import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  '${url}',           // XupaStack gateway URL
  process.env.SUPABASE_ANON_KEY  // Your original Supabase anon key
)`.replace("${url}", url),

  nextjs: (url) =>
    `// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  '${url}',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// .env.local
// NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>`.replace(
      "${url}",
      url
    ),

  vite: (url) =>
    `// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  '${url}',
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// .env
// VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>`.replace("${url}", url),

  node: (url) =>
    `const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  '${url}',
  process.env.SUPABASE_ANON_KEY
)`.replace("${url}", url),

  python: (url) =>
    `import os
from supabase import create_client, Client

url: str = '${url}'
key: str = os.environ.get('SUPABASE_ANON_KEY', '')  # your original anon key

supabase: Client = create_client(url, key)`.replace("${url}", url),

  flutter: (url) =>
    `import 'package:supabase_flutter/supabase_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: '${url}',
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
  );

  runApp(const MyApp());
}

// Anywhere in your app:
final supabase = Supabase.instance.client;`.replace("${url}", url),

  expo: (url) =>
    `import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const supabase = createClient(
  '${url}',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)

// app.config.js / eas.json
// EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>`.replace(
      "${url}",
      url
    ),

  lovable: (url) =>
    `# In Lovable's Supabase integration settings,
# replace the Supabase URL with your XupaStack gateway URL.

Supabase URL : ${url}
Anon Key     : <your Supabase project anon key — unchanged>

Go to: Supabase panel → Settings → replace the project URL with the gateway URL above.
Your anon key stays exactly the same.`.replace("${url}", url),

  emergent: (url) =>
    `# Emergent.sh / Python AI agent
import os
from supabase import create_client

supabase = create_client(
    '${url}',
    os.environ['SUPABASE_ANON_KEY']  # your original anon key
)

# Example: query a table
rows = supabase.table('my_table').select('*').execute()`.replace("${url}", url),

  other: (url) =>
    `# XupaStack gateway connection details
Gateway URL : ${url}
Anon Key    : <your Supabase project anon key>

Pass these two values wherever the Supabase SDK accepts a URL and anon key.
The gateway is a drop-in replacement — only the URL changes.`.replace(
      "${url}",
      url
    ),
};

// ── Public API ─────────────────────────────────────────────────────────────────

export function getSnippet(
  gatewayUrl: string,
  stack: Stack
): string {
  return builders[stack](gatewayUrl);
}

export function getSnippets(
  gatewayUrl: string
): Record<Stack, string> {
  return Object.fromEntries(
    SUPPORTED_STACKS.map((s) => [s, builders[s](gatewayUrl)])
  ) as Record<Stack, string>;
}
