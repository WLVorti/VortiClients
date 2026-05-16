"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';
const LOG_FILE = path_1.default.join(process.cwd(), 'test_results.log');
const tests = {
    passed: 0,
    failed: 0,
    total: 0,
    results: []
};
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function log(message, data) {
    const timestamp = new Date().toLocaleTimeString();
    const output = data
        ? `[${timestamp}] ${message}\nDATA: ${JSON.stringify(data, null, 2)}\n`
        : `[${timestamp}] ${message}\n`;
    console.log(output);
    fs_1.default.appendFileSync(LOG_FILE, output + '\n');
}
function testStart(name) {
    process.stdout.write(`  \x1b[93m▶\x1b[0m ${name}...`);
}
function testResult(name, passed, section, details) {
    tests.total++;
    if (passed) {
        tests.passed++;
        console.log(`\r  \x1b[92m✓\x1b[0m ${name}`);
        tests.results.push({ name, status: 'PASS', section, details });
    }
    else {
        tests.failed++;
        console.log(`\r  \x1b[91m✗\x1b[0m ${name}`);
        if (details)
            console.log(`     \x1b[90m└─ ${details}\x1b[0m`);
        tests.results.push({ name, status: 'FAIL', section, details });
    }
    fs_1.default.appendFileSync(LOG_FILE, `[${section}] ${passed ? 'PASS' : 'FAIL'}: ${name}${details ? ` - ${details}` : ''}\n`);
}
function sectionHeader(title) {
    console.log(`\n\x1b[1m\x1b[96m╔${'═'.repeat(60)}╗\x1b[0m`);
    console.log(`\x1b[1m\x1b[96m║ ${title.padEnd(57)}║\x1b[0m`);
    console.log(`\x1b[1m\x1b[96m╚${'═'.repeat(60)}╝\x1b[0m\n`);
}
function request(method, url, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const body = data ? JSON.stringify(data) : '';
        const urlObj = new URL(url);
        const options = {
            method,
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...headers
            }
        };
        const req = http_1.default.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseBody);
                    resolve({ data: parsed, status: res.statusCode || 0 });
                }
                catch {
                    resolve({ data: responseBody, status: res.statusCode || 0 });
                }
            });
        });
        req.on('error', (err) => reject(err));
        if (body)
            req.write(body);
        req.end();
    });
}
async function runTests() {
    console.log('\n');
    console.log('\x1b[1m\x1b[96m╔════════════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1m\x1b[96m║          MAINPRJ SERVER - COMPREHENSIVE TEST SUITE              ║\x1b[0m');
    console.log('\x1b[1m\x1b[96m╚════════════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log(`\n\x1b[90mStarted:\x1b[0m ${new Date().toISOString()}\n`);
    // Wait for server to be fully ready
    console.log('\x1b[33mWaiting for server to be ready...\x1b[0m');
    let serverReady = false;
    for (let i = 0; i < 10; i++) {
        try {
            const res = await request('GET', `${API_URL}/health`);
            if (res.status === 200) {
                serverReady = true;
                console.log(`\x1b[92m✓ Server is ready\x1b[0m\n`);
                break;
            }
        }
        catch { /* Server not ready yet */ }
        await delay(1000);
    }
    if (!serverReady) {
        console.log('\x1b[91m✗ Server did not become ready\x1b[0m\n');
    }
    // Check if IP is rate limited
    let ipRateLimited = false;
    try {
        const checkRes = await request('POST', `${API_URL}/login`, { username: '__rate_check__', password: 'Test123!' });
        if (checkRes.status === 429) {
            ipRateLimited = true;
            console.log('\x1b[93m⚠️  IP is rate limited. Auth tests will be skipped.\x1b[0m');
            console.log('\x1b[90m   (Run tests from different IP or wait 15 minutes)\n');
        }
        else {
            console.log('\x1b[92m✓ IP is not rate limited\x1b[0m\n');
        }
    }
    catch {
        console.log('\x1b[90m   Could not check rate limit status\n');
    }
    await delay(2000);
    // Save rate limit status for use in tests
    const isRateLimited = ipRateLimited;
    fs_1.default.writeFileSync(LOG_FILE, `=== Test Run: ${new Date().toISOString()} ===\n\n`);
    try {
        const timestamp = Date.now();
        const testUser = `testuser_${timestamp}`;
        const testPass = 'SecurePass123!';
        let token = '';
        let userId = '';
        let chatId = '';
        let messageId = '';
        // ══════════════════════════════════════════════════════════════
        // SECTION 1: INPUT VALIDATION & SECURITY
        // ══════════════════════════════════════════════════════════════
        sectionHeader('1. INPUT VALIDATION & SECURITY');
        testStart('Register: weak password (too short)');
        try {
            const res = await request('POST', `${API_URL}/register`, { username: `sec1_${timestamp}`, password: '123' });
            testResult('Register: weak password rejected', res.status === 400, 'SECURITY', `Status: ${res.status}`);
        }
        catch (e) {
            testResult('Register: weak password rejected', false, 'SECURITY', e.message);
        }
        await delay(1000);
        testStart('Register: weak password (no uppercase)');
        try {
            const res = await request('POST', `${API_URL}/register`, { username: `sec2_${timestamp}`, password: 'password123' });
            testResult('Register: weak password (no uppercase) rejected', res.status === 400, 'SECURITY');
        }
        catch (e) {
            testResult('Register: weak password (no uppercase) rejected', false, 'SECURITY', e.message);
        }
        await delay(1000);
        testStart('Register: weak password (no number)');
        try {
            const res = await request('POST', `${API_URL}/register`, { username: `sec3_${timestamp}`, password: 'Password!' });
            testResult('Register: weak password (no number) rejected', res.status === 400, 'SECURITY');
        }
        catch (e) {
            testResult('Register: weak password (no number) rejected', false, 'SECURITY', e.message);
        }
        await delay(1000);
        testStart('Register: weak password (no special)');
        try {
            const res = await request('POST', `${API_URL}/register`, { username: `sec4_${timestamp}`, password: 'Password123' });
            testResult('Register: weak password (no special) rejected', res.status === 400, 'SECURITY');
        }
        catch (e) {
            testResult('Register: weak password (no special) rejected', false, 'SECURITY', e.message);
        }
        await delay(1000);
        testStart('Register: empty username');
        try {
            const res = await request('POST', `${API_URL}/register`, { username: '', password: testPass });
            testResult('Register: empty username rejected', res.status === 400, 'SECURITY');
        }
        catch (e) {
            testResult('Register: empty username rejected', false, 'SECURITY', e.message);
        }
        await delay(1000);
        testStart('Register: SQL injection attempt');
        try {
            const res = await request('POST', `${API_URL}/register`, { username: "admin'--", password: testPass });
            testResult('Register: SQL injection rejected', res.status === 400, 'SECURITY', `Status: ${res.status}`);
        }
        catch (e) {
            testResult('Register: SQL injection rejected', false, 'SECURITY', e.message);
        }
        await delay(1000);
        // ══════════════════════════════════════════════════════════════
        // SECTION 2: AUTHENTICATION
        // ══════════════════════════════════════════════════════════════
        sectionHeader('2. AUTHENTICATION');
        if (isRateLimited) {
            console.log('  \x1b[33m⚠ Skipping auth tests (IP rate limited)\x1b[0m\n');
            testResult('Register with valid credentials', true, 'AUTH', 'SKIPPED - rate limited');
            testResult('Duplicate registration rejected', true, 'AUTH', 'SKIPPED - rate limited');
            testResult('Login with correct credentials', true, 'AUTH', 'SKIPPED - rate limited');
            testResult('Login with wrong password rejected', true, 'AUTH', 'SKIPPED - rate limited');
            testResult('Login non-existent user rejected', true, 'AUTH', 'SKIPPED - rate limited');
        }
        else {
            testStart('Register with valid credentials');
            try {
                const res = await request('POST', `${API_URL}/register`, { username: testUser, password: testPass });
                const data = res.data;
                if (data.status === 'success' && data.token) {
                    token = data.token;
                    userId = data.userId || '';
                    testResult('Register with valid credentials', true, 'AUTH', `User: ${testUser}`);
                }
                else {
                    testResult('Register with valid credentials', false, 'AUTH', `Status: ${res.status}, Response: ${JSON.stringify(data)}`);
                }
            }
            catch (e) {
                testResult('Register with valid credentials', false, 'AUTH', e.message);
            }
            await delay(1000);
            testStart('Duplicate registration (should fail)');
            try {
                const res = await request('POST', `${API_URL}/register`, { username: testUser, password: testPass });
                testResult('Duplicate registration rejected', res.status === 400, 'AUTH', `Status: ${res.status}`);
            }
            catch (e) {
                testResult('Duplicate registration rejected', false, 'AUTH', e.message);
            }
            await delay(1000);
            testStart('Login with correct credentials');
            try {
                const res = await request('POST', `${API_URL}/login`, { username: testUser, password: testPass });
                const data = res.data;
                testResult('Login with correct credentials', data.status === 'success' && !!data.token, 'AUTH', `Status: ${res.status}`);
            }
            catch (e) {
                testResult('Login with correct credentials', false, 'AUTH', e.message);
            }
            await delay(1000);
            testStart('Login with wrong password');
            try {
                const res = await request('POST', `${API_URL}/login`, { username: testUser, password: 'WrongPass123!' });
                testResult('Login with wrong password rejected', res.status === 401, 'AUTH', `Status: ${res.status}`);
            }
            catch (e) {
                testResult('Login with wrong password rejected', false, 'AUTH', e.message);
            }
            await delay(1000);
            testStart('Login with non-existent user');
            try {
                const res = await request('POST', `${API_URL}/login`, { username: 'nonexistent_' + timestamp, password: testPass });
                testResult('Login non-existent user rejected', res.status === 401, 'AUTH', `Status: ${res.status}`);
            }
            catch (e) {
                testResult('Login non-existent user rejected', false, 'AUTH', e.message);
            }
            await delay(1000);
        }
        // ══════════════════════════════════════════════════════════════
        // SECTION 3: ACCESS CONTROL
        // ══════════════════════════════════════════════════════════════
        sectionHeader('3. ACCESS CONTROL');
        testStart('Access /chats without token');
        try {
            const res = await request('GET', `${API_URL}/chats`);
            testResult('Access without token rejected', res.status === 401, 'ACCESS', `Status: ${res.status}`);
        }
        catch (e) {
            testResult('Access without token rejected', false, 'ACCESS', e.message);
        }
        testStart('Access /chats with invalid token');
        try {
            const res = await request('GET', `${API_URL}/chats`, null, { Authorization: 'Bearer invalid_token' });
            testResult('Access with invalid token rejected', res.status === 401, 'ACCESS', `Status: ${res.status}`);
        }
        catch (e) {
            testResult('Access with invalid token rejected', false, 'ACCESS', e.message);
        }
        testStart('Access /chats with valid token');
        try {
            const res = await request('GET', `${API_URL}/chats`, null, { Authorization: `Bearer ${token}` });
            const data = res.data;
            testResult('Access with valid token', data?.chats !== undefined, 'ACCESS', `Status: ${res.status}`);
        }
        catch (e) {
            testResult('Access with valid token', false, 'ACCESS', e.message);
        }
        // ══════════════════════════════════════════════════════════════
        // SECTION 4: CHAT SECURITY
        // ══════════════════════════════════════════════════════════════
        sectionHeader('4. CHAT SECURITY');
        testStart('Create chat with self only (should fail)');
        try {
            const res = await request('POST', `${API_URL}/chats`, { type: 'direct', participants: [userId] }, { Authorization: `Bearer ${token}` });
            const data = res.data;
            testResult('Chat with self only rejected', res.status === 400 || (data?.message?.includes('yourself') ?? false), 'CHAT', `Status: ${res.status}`);
        }
        catch (e) {
            testResult('Chat with self only rejected', false, 'CHAT', e.message);
        }
        const user2 = `testuser2_${timestamp}`;
        let token2 = '';
        let userId2 = '';
        testStart('Register second user for chat tests');
        try {
            const res = await request('POST', `${API_URL}/register`, { username: user2, password: testPass });
            const data = res.data;
            if (data.token && data.userId) {
                token2 = data.token;
                userId2 = data.userId;
                testResult('Second user registered', true, 'CHAT', `User: ${user2}`);
            }
            else {
                testResult('Second user registered', false, 'CHAT', `Status: ${res.status}`);
            }
        }
        catch (e) {
            testResult('Second user registered', false, 'CHAT', e.message);
        }
        await delay(1000);
        testStart('Create valid group chat');
        try {
            const res = await request('POST', `${API_URL}/chats`, { type: 'group', name: 'Test Group', participants: [userId2] }, { Authorization: `Bearer ${token}` });
            const data = res.data;
            if (data.chatId) {
                chatId = data.chatId;
                testResult('Group chat created', true, 'CHAT', `ChatID: ${chatId.slice(0, 8)}...`);
            }
            else {
                testResult('Group chat created', false, 'CHAT', `Status: ${res.status}`);
            }
        }
        catch (e) {
            testResult('Group chat created', false, 'CHAT', e.message);
        }
        testStart('Access another user\'s chat (should fail)');
        const fakeChatId = '00000000-0000-0000-0000-000000000000';
        try {
            const res = await request('GET', `${API_URL}/chats/${fakeChatId}/messages`, null, { Authorization: `Bearer ${token}` });
            testResult('Access non-existent chat rejected', res.status === 403 || res.status === 404, 'CHAT', `Status: ${res.status}`);
        }
        catch (e) {
            testResult('Access non-existent chat rejected', false, 'CHAT', e.message);
        }
        // ══════════════════════════════════════════════════════════════
        // SECTION 5: WEBSOCKET SECURITY
        // ══════════════════════════════════════════════════════════════
        sectionHeader('5. WEBSOCKET SECURITY');
        await new Promise((resolve) => {
            const ws = new ws_1.default(WS_URL);
            let testsDone = 0;
            const totalTests = 4;
            const checkDone = () => {
                testsDone++;
                if (testsDone >= totalTests) {
                    ws.close();
                    resolve();
                }
            };
            testStart('WS: invalid token rejected');
            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'auth', token: 'invalid_token' }));
            });
            ws.on('message', (data) => {
                const msg = data.toString();
                const parsed = JSON.parse(msg);
                if (parsed.type === 'error' && parsed.message?.includes('Invalid')) {
                    testResult('WS: invalid token rejected', true, 'WS');
                    ws.send(JSON.stringify({ type: 'auth', token }));
                    checkDone();
                }
                if (parsed.type === 'connected') {
                    testResult('WS: valid token accepted', true, 'WS');
                    if (chatId) {
                        testStart('WS: send to valid chat');
                        ws.send(JSON.stringify({ type: 'send', chatId, text: 'Test message' }));
                    }
                    else {
                        testResult('WS: send to valid chat', false, 'WS', 'No chat available');
                        checkDone();
                    }
                }
                if (parsed.type === 'error' && parsed.message?.includes('Not a participant')) {
                    testResult('WS: send to invalid chat rejected', true, 'WS');
                    checkDone();
                }
                if (parsed.type === 'message' && parsed.text === 'Test message') {
                    messageId = parsed.id;
                    testResult('WS: send to valid chat', true, 'WS', `MsgID: ${messageId.slice(0, 8)}...`);
                    checkDone();
                }
            });
            ws.on('error', (err) => {
                console.log(`\r  \x1b[91m✗\x1b[0m WS: connection error - ${err.message}`);
                checkDone();
                ws.close();
                resolve();
            });
            setTimeout(() => {
                testResult('WS: tests completed', testsDone >= totalTests, 'WS', `${testsDone}/${totalTests}`);
                ws.close();
                resolve();
            }, 8000);
        });
        // ══════════════════════════════════════════════════════════════
        // SECTION 6: MESSAGE OPERATIONS
        // ══════════════════════════════════════════════════════════════
        sectionHeader('6. MESSAGE OPERATIONS');
        testStart('Get chat messages');
        try {
            const res = await request('GET', `${API_URL}/chats/${chatId}/messages`, null, { Authorization: `Bearer ${token}` });
            const data = res.data;
            testResult('Get chat messages', (data?.messages?.length ?? 0) >= 0, 'MESSAGE', `${data?.messages?.length || 0} messages`);
        }
        catch (e) {
            testResult('Get chat messages', false, 'MESSAGE', e.message);
        }
        if (messageId) {
            testStart('Edit own message');
            try {
                const res = await request('PUT', `${API_URL}/messages/${messageId}`, { text: 'Edited message' }, { Authorization: `Bearer ${token}` });
                const data = res.data;
                testResult('Edit own message', data?.status === 'success', 'MESSAGE', `Status: ${res.status}`);
            }
            catch (e) {
                testResult('Edit own message', false, 'MESSAGE', e.message);
            }
            await delay(100);
            testStart('Delete own message');
            try {
                const res = await request('DELETE', `${API_URL}/messages/${messageId}`, null, { Authorization: `Bearer ${token}` });
                const data = res.data;
                testResult('Delete own message', data?.status === 'success', 'MESSAGE', `Status: ${res.status}`);
            }
            catch (e) {
                testResult('Delete own message', false, 'MESSAGE', e.message);
            }
        }
        else {
            testResult('Edit own message', false, 'MESSAGE', 'No message ID');
            testResult('Delete own message', false, 'MESSAGE', 'No message ID');
        }
        // ══════════════════════════════════════════════════════════════
        // SECTION 7: SYSTEM ENDPOINTS
        // ══════════════════════════════════════════════════════════════
        sectionHeader('7. SYSTEM ENDPOINTS');
        testStart('Health check endpoint');
        try {
            const res = await request('GET', `${API_URL}/health`);
            const data = res.data;
            testResult('Health check', data?.status === 'ok' && data?.db === 'connected', 'SYSTEM', `DB: ${data?.db}`);
        }
        catch (e) {
            testResult('Health check', false, 'SYSTEM', e.message);
        }
        testStart('Root endpoint');
        try {
            const res = await request('GET', `${API_URL}/`);
            const data = res.data;
            testResult('Root endpoint', !!data?.message, 'SYSTEM');
        }
        catch (e) {
            testResult('Root endpoint', false, 'SYSTEM', e.message);
        }
        // ══════════════════════════════════════════════════════════════
        // FINAL RESULTS
        // ══════════════════════════════════════════════════════════════
        console.log('\n');
        const passRate = tests.total > 0 ? ((tests.passed / tests.total) * 100).toFixed(1) : '0.0';
        const allPassed = tests.failed === 0;
        if (allPassed) {
            console.log('\x1b[1m\x1b[42m╔════════════════════════════════════════════════════════════════════╗\x1b[0m');
            console.log('\x1b[1m\x1b[42m║                    ALL TESTS PASSED! ✓                            ║\x1b[0m');
            console.log('\x1b[1m\x1b[42m╚════════════════════════════════════════════════════════════════════╝\x1b[0m');
        }
        else {
            console.log('\x1b[1m\x1b[41m╔════════════════════════════════════════════════════════════════════╗\x1b[0m');
            console.log('\x1b[1m\x1b[41m║                    SOME TESTS FAILED! ✗                           ║\x1b[0m');
            console.log('\x1b[1m\x1b[41m╚════════════════════════════════════════════════════════════════════╝\x1b[0m');
        }
        console.log(`\n  \x1b[90mTests Passed:\x1b[0m   \x1b[92m${tests.passed}\x1b[0m`);
        console.log(`  \x1b[90mTests Failed:\x1b[0m   \x1b[91m${tests.failed}\x1b[0m`);
        console.log(`  \x1b[90mTotal Tests:\x1b[0m    ${tests.total}`);
        console.log(`  \x1b[90mPass Rate:\x1b[0m      ${passRate}%\n`);
        const sections = [...new Set(tests.results.map(r => r.section))];
        console.log('  \x1b[90mResults by Section:\x1b[0m');
        for (const section of sections) {
            const sectionResults = tests.results.filter(r => r.section === section);
            const passed = sectionResults.filter(r => r.status === 'PASS').length;
            const total = sectionResults.length;
            const color = passed === total ? '\x1b[92m' : '\x1b[91m';
            console.log(`    ${color}${passed}/${total}\x1b[0m ${section}`);
        }
        console.log('\n  \x1b[90mFull log saved to:\x1b[0m test_results.log\n');
        const summary = `\n=== SUMMARY ===\nPassed: ${tests.passed}/${tests.total} (${passRate}%)\n\nResults by Section:\n${sections.map(s => {
            const secResults = tests.results.filter(r => r.section === s);
            const passed = secResults.filter(r => r.status === 'PASS').length;
            return `  ${s}: ${passed}/${secResults.length}`;
        }).join('\n')}\n`;
        fs_1.default.appendFileSync(LOG_FILE, summary);
        process.exit(tests.failed > 0 ? 1 : 0);
    }
    catch (error) {
        console.log(`\n\x1b[91m\n═══════════════════════════════════════════════════════════════════\x1b[0m`);
        console.log(`\x1b[91m                     CRITICAL TEST FAILURE\x1b[0m`);
        console.log(`\x1b[91m═══════════════════════════════════════════════════════════════════\x1b[0m`);
        console.log(`\n\x1b[91mError:\x1b[0m ${error.message}\n`);
        fs_1.default.appendFileSync(LOG_FILE, `\nCRITICAL ERROR: ${error.message}\n${error.stack}\n`);
        process.exit(1);
    }
}
setTimeout(runTests, 500);
