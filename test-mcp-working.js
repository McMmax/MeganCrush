#!/usr/bin/env node
/**
 * Megan: Operational MCP & Model Test
 * Tests actual tool execution to verify all systems working
 */

const fs = require('fs');
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

async function testMCPExecution(name, path, testPrompt) {
  return new Promise((resolve) => {
    try {
      const mcp = spawn('node', [path], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000
      });

      let output = '';
      let responses = [];

      mcp.stdout.on('data', (data) => {
        output += data.toString();
      });

      const initMsg = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {} }
      });

      mcp.stdin.write(initMsg + '\n');
      
      setTimeout(() => {
        // Send tool call after initialization
        const toolCall = JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: name.toLowerCase(),
            arguments: testPrompt
          }
        });
        mcp.stdin.write(toolCall + '\n');
      }, 200);

      const timeout = setTimeout(() => {
        mcp.kill();
        resolve({
          name,
          status: 'timeout',
          working: false,
          model: 'N/A'
        });
      }, 25000);

      let lineCount = 0;
      const lines = output.split('\n');
      
      mcp.on('close', () => {
        clearTimeout(timeout);
        try {
          const lines = output.split('\n').filter(l => l.trim());
          let toolResponse = null;
          
          for (const line of lines) {
            const msg = JSON.parse(line);
            if (msg.id === 2 && msg.result) {
              toolResponse = msg.result;
              break;
            }
          }

          if (toolResponse && toolResponse.content && toolResponse.content.length > 0) {
            const text = toolResponse.content[0]?.text || '';
            const hasError = toolResponse.isError || text.includes('Error:');
            
            resolve({
              name,
              status: hasError ? 'error' : 'working',
              working: !hasError,
              response: text.substring(0, 100)
            });
          } else {
            resolve({
              name,
              status: 'no_response',
              working: false
            });
          }
        } catch (e) {
          resolve({
            name,
            status: 'parse_error',
            working: false
          });
        }
      });
    } catch (err) {
      resolve({
        name,
        status: 'exception',
        working: false,
        error: err.message
      });
    }
  });
}

async function run() {
  console.log('\n' + colors.cyan + '╔═══════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.cyan + '║     Megan: Operational MCP Server Test' + colors.reset);
  console.log(colors.cyan + '╚═══════════════════════════════════════════════════╝' + colors.reset + '\n');

  const tests = [
    {
      name: 'Claude',
      path: path.join(os.homedir(), '.config/crush/mcp-servers/claude-code-mcp.js'),
      prompt: { prompt: 'What is 2+2?', model: 'claude-sonnet-4-20250514', max_tokens: 50 },
      model: 'claude-sonnet-4-20250514'
    },
    {
      name: 'Gemini',
      path: path.join(os.homedir(), '.config/crush/mcp-servers/gemini-mcp.js'),
      prompt: { prompt: 'What is 3+3?', model: 'gemini-2.5-pro', max_output_tokens: 50 },
      model: 'gemini-2.5-pro'
    },
    {
      name: 'Codex',
      path: path.join(os.homedir(), '.config/crush/mcp-servers/codex-mcp.js'),
      prompt: { prompt: 'echo "Hello from Codex"' },
      model: 'o1 (via CLI)'
    }
  ];

  console.log(colors.bold + colors.blue + '🧪 Testing Actual MCP Execution' + colors.reset);
  console.log('─────────────────────────────────────────────────────\n');

  const results = [];
  for (const test of tests) {
    process.stdout.write(`Testing ${test.name}... `);
    const result = await testMCPExecution(test.name, test.path, test.prompt);
    result.model = test.model;
    results.push(result);
    
    if (result.working) {
      console.log(colors.green + '✅ Working' + colors.reset);
    } else {
      console.log(colors.red + `❌ ${result.status}` + colors.reset);
    }
  }

  console.log('\n' + colors.bold + colors.blue + '📊 Results' + colors.reset);
  console.log('─────────────────────────────────────────────────────\n');

  results.forEach(r => {
    const icon = r.working ? '✅' : '❌';
    const color = r.working ? 'green' : 'red';
    console.log(`${colors[color]}${icon} ${r.name}${colors.reset}`);
    console.log(`   Model: ${colors.cyan}${r.model}${colors.reset}`);
    console.log(`   Status: ${r.status}`);
    if (r.response) {
      console.log(`   Response: "${r.response.substring(0, 60)}${r.response.length > 60 ? '...' : ''}"`);
    }
    console.log();
  });

  const allWorking = results.every(r => r.working);
  console.log(colors.cyan + '╔═══════════════════════════════════════════════════╗' + colors.reset);
  if (allWorking) {
    console.log(colors.green + '║ ✅ All MCP servers fully operational!' + colors.reset);
  } else {
    console.log(colors.yellow + '║ ⚠️  Some MCP servers not responding' + colors.reset);
  }
  console.log(colors.cyan + '╚═══════════════════════════════════════════════════╝' + colors.reset + '\n');

  process.exit(allWorking ? 0 : 1);
}

run().catch(err => {
  console.error(`${colors.red}❌ Fatal: ${err.message}${colors.reset}`);
  process.exit(1);
});
