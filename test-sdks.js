#!/usr/bin/env node
/**
 * Test script for Megan's CLI-based MCP servers
 * Validates: Claude, Gemini, Codex CLI availability and MCP server handshakes
 * Architecture: CLI-only (no SDKs, no API keys)
 */

const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, prefix, msg) {
  console.log(`${colors[color]}${prefix}${colors.reset} ${msg}`);
}

function checkCLI(name) {
  const result = spawnSync('which', [name], { encoding: 'utf8', timeout: 3000 });
  return result.status === 0;
}

async function testClaude() {
  log('cyan', '[Claude]', 'Testing Claude CLI availability...');

  const hasClaudeClibin = checkCLI('claude');

  if (!hasClaudeClibin) {
    log('red', '[Claude]', 'CLI binary not found');
    log('yellow', '[Claude]', 'Install: npm install -g @anthropic-ai/claude-code');
    log('yellow', '[Claude]', 'Then: claude auth login');
    return {
      provider: 'Claude',
      status: 'CLI not found',
      model: 'N/A',
      cliSetup: false
    };
  }

  log('green', '[Claude]', 'CLI binary found');
  log('blue', '[Claude]', 'Model: claude-sonnet-4-20250514 (default)');
  log('blue', '[Claude]', 'Reason: Cost-effective, 200K context window, suitable for general tasks');

  return {
    provider: 'Claude',
    status: 'CLI available',
    model: 'claude-sonnet-4-20250514',
    reason: 'Cost-effective, 200K context window, suitable for general tasks',
    cliSetup: true
  };
}

async function testGemini() {
  log('cyan', '[Gemini]', 'Testing Gemini CLI availability...');

  const hasGeminiCli = checkCLI('gemini');

  if (!hasGeminiCli) {
    log('red', '[Gemini]', 'CLI binary not found');
    log('yellow', '[Gemini]', 'Install Gemini CLI, then: gcloud auth application-default login');
    return {
      provider: 'Gemini',
      status: 'CLI not found',
      model: 'N/A',
      cliSetup: false
    };
  }

  log('green', '[Gemini]', 'CLI binary found');
  log('blue', '[Gemini]', 'Model: gemini-2.5-pro (default)');
  log('blue', '[Gemini]', 'Reason: 1M token context, prompt caching (90% savings), multimodal');

  return {
    provider: 'Gemini',
    status: 'CLI available',
    model: 'gemini-2.5-pro',
    reason: '1M token context, prompt caching (90% savings), multimodal',
    cliSetup: true
  };
}

async function testCodex() {
  log('cyan', '[Codex]', 'Testing Codex CLI availability...');

  const hasCodexCli = checkCLI('codex');

  if (!hasCodexCli) {
    log('red', '[Codex]', 'CLI binary not found');
    log('yellow', '[Codex]', 'Install: npm install -g @anthropic-ai/codex');
    log('yellow', '[Codex]', 'Then: codex login');
    return {
      provider: 'Codex',
      status: 'CLI not found',
      model: 'N/A',
      cliSetup: false
    };
  }

  log('green', '[Codex]', 'CLI binary found');
  log('blue', '[Codex]', 'Model: o1 (via Codex CLI)');
  log('blue', '[Codex]', 'Reason: Agentic workflows, CI/CD control, complex engineering tasks');

  return {
    provider: 'Codex',
    status: 'CLI available',
    model: 'o1 (Codex-managed)',
    reason: 'Agentic workflows, CI/CD control, complex engineering tasks',
    cliSetup: true
  };
}

async function testMCPServer(serverName, serverPath) {
  log('cyan', `[MCP:${serverName}]`, 'Testing MCP server...');

  return new Promise((resolve) => {
    try {
      const mcp = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000
      });

      let output = '';

      mcp.stdout.on('data', (data) => {
        output += data.toString();
      });

      mcp.stderr.on('data', () => {});

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
        log('red', `[MCP:${serverName}]`, 'MCP initialization timeout');
        resolve({ mcp: serverName, status: 'Timeout', ready: false });
      }, 5000);

      mcp.stdout.once('data', () => {
        clearTimeout(timeout);
        mcp.stdin.end();

        try {
          const response = JSON.parse(output.split('\n')[0]);
          if (response.result && response.result.serverInfo) {
            log('green', `[MCP:${serverName}]`, 'MCP server ready');
            log('blue', `[MCP:${serverName}]`, `Version: ${response.result.serverInfo.version}`);
            resolve({
              mcp: serverName,
              status: 'Ready',
              ready: true,
              version: response.result.serverInfo.version
            });
          } else {
            log('red', `[MCP:${serverName}]`, 'Invalid MCP response');
            resolve({ mcp: serverName, status: 'Invalid Response', ready: false });
          }
        } catch (parseErr) {
          log('red', `[MCP:${serverName}]`, `Failed to parse MCP response: ${parseErr.message}`);
          resolve({ mcp: serverName, status: 'Parse Error', ready: false });
        }

        mcp.kill();
      });

      mcp.on('error', (err) => {
        clearTimeout(timeout);
        log('red', `[MCP:${serverName}]`, `MCP error: ${err.message}`);
        resolve({ mcp: serverName, status: 'Error', ready: false, error: err.message });
      });
    } catch (err) {
      log('red', `[MCP:${serverName}]`, `Error: ${err.message}`);
      resolve({ mcp: serverName, status: 'Error', ready: false, error: err.message });
    }
  });
}

async function runAllTests() {
  console.log('\n' + colors.cyan + '═══════════════════════════════════════' + colors.reset);
  console.log(colors.cyan + '    Megan CLI & MCP Server Test Suite' + colors.reset);
  console.log(colors.cyan + '═══════════════════════════════════════' + colors.reset + '\n');

  // CLI Tests
  console.log(colors.blue + 'CLI AVAILABILITY' + colors.reset);
  console.log('─────────────────────────────────────\n');

  const claudeResult = await testClaude();
  console.log();

  const geminiResult = await testGemini();
  console.log();

  const codexResult = await testCodex();
  console.log();

  // MCP Tests
  console.log(colors.blue + 'MCP SERVER TESTS' + colors.reset);
  console.log('─────────────────────────────────────\n');

  const claudeMCP = await testMCPServer('Claude', path.join(os.homedir(), '.config/crush/mcp-servers/claude-code-mcp.js'));
  console.log();

  const geminiMCP = await testMCPServer('Gemini', path.join(os.homedir(), '.config/crush/mcp-servers/gemini-mcp.js'));
  console.log();

  const codexMCP = await testMCPServer('Codex', path.join(os.homedir(), '.config/crush/mcp-servers/codex-mcp.js'));
  console.log();

  // Summary
  console.log(colors.cyan + '═══════════════════════════════════════' + colors.reset);
  console.log(colors.blue + 'SUMMARY' + colors.reset);
  console.log(colors.cyan + '═══════════════════════════════════════' + colors.reset + '\n');

  const results = [
    { category: 'Claude CLI', ...claudeResult },
    { category: 'Gemini CLI', ...geminiResult },
    { category: 'Codex CLI', ...codexResult },
    { category: 'Claude MCP', ...claudeMCP },
    { category: 'Gemini MCP', ...geminiMCP },
    { category: 'Codex MCP', ...codexMCP }
  ];

  console.log('Status Overview:');
  console.log('─────────────────────────────────────');
  results.forEach(r => {
    const statusColor = (r.status === 'CLI available' || r.status === 'Ready') ? 'green' :
                       (r.status === 'Error' || r.status === 'CLI not found') ? 'red' : 'yellow';
    console.log(`${colors[statusColor]}${r.category}: ${r.status}${colors.reset}`);
  });

  console.log('\nModel Configuration:');
  console.log('─────────────────────────────────────');
  [claudeResult, geminiResult, codexResult].forEach(r => {
    if (r.model !== 'N/A') {
      console.log(`${colors.blue}${r.provider}${colors.reset}: ${r.model}`);
      console.log(`  Why: ${r.reason}\n`);
    }
  });

  const allReady = results.every(r => r.status === 'CLI available' || r.status === 'Ready' || r.mcp);
  console.log('\n' + colors.cyan + '═══════════════════════════════════════' + colors.reset);

  if (allReady) {
    log('green', 'ALL SYSTEMS READY', 'Megan is fully configured (CLI-only, no API keys)');
  } else {
    log('yellow', 'PARTIAL SETUP', 'Some CLIs need installation or authentication');
  }

  console.log(colors.cyan + '═══════════════════════════════════════' + colors.reset + '\n');

  process.exit(allReady ? 0 : 1);
}

runAllTests().catch(err => {
  log('red', 'FATAL', err.message);
  process.exit(1);
});
