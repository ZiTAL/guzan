const http = require('http');
const fs = require('fs');
const path = require('path');

// Test 1: Home page should return 200
const testHome = () => {
  return new Promise((resolve) => {
    http.get('http://localhost:3000/', (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        console.error(`Home test failed: expected 200, got ${res.statusCode}`);
        process.exit(1);
      }
    }).on('error', (err) => {
      console.error('Home test failed:', err);
      process.exit(1);
    });
  });
};

// Test 2: Guzanda form page should return 200
const testGuzanda = () => {
  return new Promise((resolve) => {
    http.get('http://localhost:3000/guzanda', (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        console.error(`Guzanda test failed: expected 200, got ${res.statusCode}`);
        process.exit(1);
      }
    }).on('error', (err) => {
      console.error('Guzanda test failed:', err);
      process.exit(1);
    });
  });
};

// Test 3: Access to .db file should return 404
const testDbAccess = () => {
  return new Promise((resolve) => {
    http.get('http://localhost:3000/private/guzanda.db', (res) => {
      if (res.statusCode === 404) {
        resolve();
      } else {
        console.error(`DB access test failed: expected 404, got ${res.statusCode}`);
        process.exit(1);
      }
    }).on('error', (err) => {
      console.error('DB access test failed:', err);
      process.exit(1);
    });
  });
};

// Test 4: Access to .md file should return 404
const testMdAccess = () => {
  return new Promise((resolve) => {
    http.get('http://localhost:3000/DOCUMENTATION.md', (res) => {
      if (res.statusCode === 404) {
        resolve();
      } else {
        console.error(`MD access test failed: expected 404, got ${res.statusCode}`);
        process.exit(1);
      }
    }).on('error', (err) => {
      console.error('MD access test failed:', err);
      process.exit(1);
    });
  });
};

// Test 5: Submit a form with an uploaded audio file
const testAudioUpload = () => {
  return new Promise((resolve, reject) => {
    const boundary = '----TestBoundary' + Date.now();
    const audioName = 'test-audio.webm';
    const audioContent = Buffer.from('fake webm audio bytes for testing');

    const fields = [
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="name"\r\n\r\n',
      'Test User\r\n',
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="contact"\r\n\r\n',
      'test@example.com\r\n',
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="description"\r\n\r\n',
      'Audio upload test\r\n',
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="audio"; filename="${audioName}"\r\n`,
      'Content-Type: audio/webm\r\n\r\n'
    ].join('');

    const header = Buffer.from(fields);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, audioContent, footer]);

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/guzanda',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 && data.includes('Submission Successful')) {
          console.log('Audio upload test passed: submission accepted.');
          resolve();
        } else {
          reject(new Error(`Audio upload test failed: expected 200 and success message, got ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

Promise.all([
  testHome(),
  testGuzanda(),
  testDbAccess(),
  testMdAccess(),
  testAudioUpload()
]).then(() => {
  console.log('All tests passed!');
  process.exit(0);
}).catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});