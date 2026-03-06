#!/usr/bin/env node
/**
 * Megan MCP & Model Selection Test
 * Validates MCP server connectivity and documents model selection rationale
 */

const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const models = {
  claude: {
    default: 'claude-sonnet-4-20250514',
    alternatives: ['claude-opus-4-20250514'],
    reasoning: 'Cost-effective ($3/$15 per 1M tokens), 200K context, excellent for reasoning & synthesis',
    use_cases: [
      'Code analysis & refactoring',
      'Documentation generation',
      'Complex reasoning tasks',
      'Long-context understanding'
    ]
  },
  gemini: {
    default: 'gemini-2.5-pro',
    alternatives: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    reasoning: '1M token context window, prompt caching (90% savings), multimodal input',
    use_cases: [
      'Long document processing (1M tokens)',
      'Image/document analysis',
      'Repeated queries (cached prompts)',
      'Cost-sensitive large-scale tasks'
    ]
  },
  codex: {
    default: 'o1 (via Codex)',
    alternatives: 'Codex-managed (no direct model selection)',
    reasoning: 'Agentic workflows, CI/CD pipeline control, complex engineering task execution',
    use_cases: [
      'Multi-step engineering workflows',
      'CI/CD pipeline orchestration',
      'Code generation & modification',
      'Sandbox-based execution'
    ]
  }
};

async function testMCPServer(serverName, serverPath) {
  return new Promise((resolve) => {
    try {
      const mcp = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000
      });

      let output = '';
      let error = '';

      mcp.stdout.on('data', (data) => {
        output += data.toString();
      });

      mcp.stderr.on('data', (data) => {
        error += data.toString();
      });

      const initMsg = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {}
        }
      });

      mcp.stdin.write(initMsg + '\n');

      const timeout = setTimeout(() => {
        mcp.kill();
        resolve({
          name: serverName,
          status: 'timeout',
          ready: false,
          error: 'MCP initialization timeout'
        });
      }, 5000);

      mcp.stdout.once('data', () => {
        clearTimeout(timeout);
        mcp.stdin.end();

        try {
          const response = JSON.parse(output.split('\n')[0]);
          if (response.result && response.result.serverInfo) {
            const { name, version, auth } = response.result.serverInfo;
            resolve({
              name: serverName,
              status: 'ready',
              ready: true,
              auth: auth,
              version: version
            });
          } else {
            resolve({
              name: serverName,
              status: 'invalid_response',
              ready: false
            });
          }
        } catch (parseErr) {
          resolve({
            name: serverName,
            status: 'parse_error',
            ready: false,
            error: parseErr.message
          });
        }

        mcp.kill();
      });

      mcp.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          name: serverName,
          status: 'error',
          ready: false,
          error: err.message
        });
      });
    } catch (err) {
      resolve({
        name: serverName,
        status: 'error',
        ready: false,
        error: err.message
      });
    }
  });
}

async function runTests() {
  console.log('\n' + colors.cyan + '╔═══════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.cyan + '║       Megan: MCP Server & Model Selection Test      ║' + colors.reset);
  console.log(colors.cyan + '╚═══════════════════════════════════════════════════╝' + colors.reset + '\n');

  // Test all MCP servers
  console.log(colors.bold + colors.blue + '🔌 MCP Server Status' + colors.reset);
  console.log('─────────────────────────────────────────────────────\n');

  const claudeMCP = await testMCPServer('Claude', path.join(os.homedir(), '.config/crush/mcp-servers/claude-code-mcp.js'));
  const geminiMCP = await testMCPServer('Gemini', path.join(os.homedir(), '.config/crush/mcp-servers/gemini-mcp.js'));
  const codexMCP = await testMCPServer('Codex', path.join(os.homedir(), '.config/crush/mcp-servers/codex-mcp.js'));

  const mcpResults = [claudeMCP, geminiMCP, codexMCP];

  mcpResults.forEach(result => {
    const icon = result.ready ? '✅' : '❌';
    const color = result.ready ? 'green' : 'red';
    const authMode = result.auth || result.error || 'Unknown';
    console.log(`${colors[color]}${icon} ${result.name} MCP${colors.reset}${colors.bold}`);
    console.log(`   Status: ${result.status}${colors.reset}`);
    if (result.ready) {
      console.log(`${colors.blue}   Auth: ${authMode}${colors.reset}`);
    }
    console.log();
  });

  // Model Selection Documentation
  console.log(colors.bold + colors.blue + '📊 Model Selection & Configuration' + colors.reset);
  console.log('─────────────────────────────────────────────────────\n');

  const providers = [
    { key: 'claude', name: 'Claude', mcp: claudeMCP },
    { key: 'gemini', name: 'Gemini', mcp: geminiMCP },
    { key: 'codex', name: 'Codex', mcp: codexMCP }
  ];

  providers.forEach(({ key, name, mcp }) => {
    const model = models[key];
    const statusIcon = mcp.ready ? '✅' : '⚠️';

    console.log(`${colors.bold}${statusIcon} ${name}${colors.reset}`);
    console.log(`   Default Model: ${colors.cyan}${model.default}${colors.reset}`);
    console.log(`   Selection Rationale:`);
    console.log(`   "${model.reasoning}"\n`);
    console.log(`   Primary Use Cases:`);
    model.use_cases.forEach(useCase => {
      console.log(`   • ${useCase}`);
    });

    if (key !== 'codex') {
      console.log(`\n   Alternatives: ${model.alternatives.join(', ')}`);
    }
    console.log();
  });

  // Auth Setup Guide
  console.log(colors.bold + colors.blue + '🔐 Authentication Status & Setup' + colors.reset);
  console.log('─────────────────────────────────────────────────────\n');

  const { spawnSync: spawnSyncLocal } = require('child_process');
  const authChecks = [
    {
      provider: 'Claude',
      check: spawnSyncLocal('which', ['claude'], { encoding: 'utf8', timeout: 3000 }).status === 0,
      setup: 'npm install -g @anthropic-ai/claude-code && claude auth login'
    },
    {
      provider: 'Gemini',
      check: spawnSyncLocal('which', ['gemini'], { encoding: 'utf8', timeout: 3000 }).status === 0,
      setup: 'Install gemini CLI && gcloud auth application-default login'
    },
    {
      provider: 'Codex',
      check: spawnSyncLocal('which', ['codex'], { encoding: 'utf8', timeout: 3000 }).status === 0,
      setup: 'npm install -g @anthropic-ai/codex && codex login'
    }
  ];

  authChecks.forEach(({ provider, check, setup }) => {
    const icon = check ? '✅' : '❌';
    const color = check ? 'green' : 'yellow';
    console.log(`${colors[color]}${icon} ${provider}${colors.reset}`);
    if (!check) {
      console.log(`   ${colors.yellow}Setup: ${setup}${colors.reset}`);
    }
    console.log();
  });

  // Summary
  console.log(colors.cyan + '╔═══════════════════════════════════════════════════╗' + colors.reset);
  const allReady = mcpResults.every(r => r.ready);
  const allAuthed = authChecks.every(c => c.check);

  if (allReady && allAuthed) {
    console.log(colors.green + '║ ✅ All MCP servers ready & auth configured' + colors.reset);
  } else if (allReady) {
    console.log(colors.yellow + '║ ⚠️  MCP servers ready but some auth needed' + colors.reset);
  } else {
    console.log(colors.red + '║ ❌ Some MCP servers not responding' + colors.reset);
  }

  console.log(colors.cyan + '╚═══════════════════════════════════════════════════╝' + colors.reset + '\n');

  process.exit(allReady ? 0 : 1);
}

runTests().catch(err => {
  console.error(`${colors.red}❌ Fatal error: ${err.message}${colors.reset}`);
  process.exit(1);
});
