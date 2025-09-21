const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'imedcalc-secret-2025'; // Change in production

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Rate limiter for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP
  message: { error: 'ძალიან ბევრი შეცდომა. სცადეთ მოგვიანებით.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize database
const db = new sqlite3.Database('database.db');
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Reset tokens table
  db.run(`CREATE TABLE IF NOT EXISTS reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    expires DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
  
  console.log('Database initialized successfully');
});

// Input validation helper
function validateInput(data, requiredFields, validators = {}) {
  for (let field of requiredFields) {
    if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
      return { valid: false, error: `საჭირო ველი: ${field}` };
    }
  }
  
  // Custom validators
  for (let [field, validator] of Object.entries(validators)) {
    if (!validator(data[field])) {
      return { valid: false, error: `არასწორი ფორმატი: ${field}` };
    }
  }
  
  return { valid: true };
}

// Registration endpoint
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  const validation = validateInput(
    req.body,
    ['name', 'email', 'password'],
    {
      password: (p) => p.length >= 8,
      email: (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
    }
  );
  
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    // Check if email exists
    db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'სერვერის შეცდომა' });
      }
      
      if (row) {
        return res.status(400).json({ error: 'იმეილი უკვე გამოყენებულია' });
      }

      // Hash password and create user
      const hash = bcrypt.hashSync(password, 12);
      db.run(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name.trim(), email.toLowerCase().trim(), hash],
        function(err) {
          if (err) {
            console.error('Registration error:', err);
            return res.status(500).json({ error: 'სერვერის შეცდომა' });
          }

          // Generate JWT
          const token = jwt.sign({ id: this.lastID, email: email.toLowerCase() }, JWT_SECRET, { 
            expiresIn: '24h' 
          });

          res.status(201).json({ 
            message: 'რეგისტრაცია წარმატებულია',
            token,
            user: { id: this.lastID, name: name.trim(), email: email.toLowerCase() }
          });
        }
      );
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'სერვერის შეცდომა' });
  }
});

// Login endpoint
app.post('/api/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  
  const validation = validateInput(
    req.body,
    ['email', 'password'],
    { email: (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }
  );
  
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], (err, user) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'სერვერის შეცდომა' });
    }

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'არასწორი იმეილი ან პაროლი' });
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { 
      expiresIn: '24h' 
    });

    res.json({ 
      message: 'შესვლა წარმატებულია',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  });
});

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'ტოკენი საჭიროა' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'არასწორი ან ვადაგასული ტოკენი' });
    }
    req.user = user;
    next();
  });
}

// Profile endpoint
app.get('/api/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, name, email FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('Profile error:', err);
      return res.status(500).json({ error: 'სერვერის შეცდომა' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'მომხმარებელი ვერ მოიძებნა' });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email
    });
  });
});

// Logo upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => {
    cb(null, `logo-${Date.now()}.svg`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/svg+xml') {
      cb(null, true);
    } else {
      cb(new Error('მხოლოდ SVG ფაილები მხარდაჭერილია'), false);
    }
  }
});

// Create uploads directory if not exists
if (!fs.existsSync('public/uploads')) {
  fs.mkdirSync('public/uploads', { recursive: true });
}

// Logo upload endpoint
app.post('/api/upload-logo', authenticateToken, upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'ფაილი არ არის ატვირთული' });
  }

  try {
    // Read and sanitize SVG
    const svgContent = fs.readFileSync(req.file.path, 'utf8');
    const sanitizedSVG = sanitizeHtml(svgContent, {
      allowedTags: ['svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'g', 'defs', 'linearGradient', 'radialGradient', 'stop'],
      allowedAttributes: {
        '*': ['fill', 'stroke', 'stroke-width', 'width', 'height', 'viewBox', 'x', 'y', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'points', 'id', 'transform', 'opacity'],
        'linearGradient': ['x1', 'x2', 'y1', 'y2'],
        'radialGradient': ['cx', 'cy', 'r', 'fx', 'fy'],
        'stop': ['offset', 'stop-color', 'stop-opacity']
      },
      allowedSchemes: ['data']
    });

    // Save sanitized SVG as main logo
    const logoPath = path.join(__dirname, 'public', 'logo.svg');
    fs.writeFileSync(logoPath, sanitizedSVG);

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({ 
      message: 'ლოგო წარმატებით ატვირთულია',
      logoUrl: '/logo.svg'
    });

  } catch (error) {
    console.error('Logo upload error:', error);
    
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'ფაილის დამუშავება ვერ მოხერხდა' });
  }
});

// Password reset request
app.post('/api/password-reset-request', (req, res) => {
  const { email } = req.body;
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'არასწორი იმეილის მისამართი' });
  }

  db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], (err, user) => {
    if (err) {
      console.error('Reset request error:', err);
      return res.status(500).json({ error: 'სერვერის შეცდომა' });
    }

    if (!user) {
      // Don't reveal if email exists (security)
      return res.json({ message: 'თუ იმეილი რეგისტრირებულია, მოგაგზავნით ინსტრუქციებს' });
    }

    // Generate reset token
    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    db.run(
      'INSERT OR REPLACE INTO reset_tokens (user_id, token, expires, used) VALUES (?, ?, ?, 0)',
      [user.id, token, expires],
      (err) => {
        if (err) {
          console.error('Token creation error:', err);
          return res.status(500).json({ error: 'სერვერის შეცდომა' });
        }

        // For development - log the reset link
        const resetUrl = `http://localhost:${PORT}/reset?token=${token}`;
        console.log(`\n🔑 პაროლის აღდგენის ბმული ${email}-სთვის:`);
        console.log(`URL: ${resetUrl}`);
        console.log(`ტოკენი: ${token}`);
        console.log(`ვადა: 1 საათი\n`);

        // In production, send email with Nodemailer
        // TODO: Integrate email service here

        res.json({ 
          message: 'თუ იმეილი რეგისტრირებულია, მალე მიიღებთ აღდგენის ინსტრუქციებს (შეამოწმეთ კონსოლი)' 
        });
      }
    );
  });
});

// Password reset endpoint
app.post('/api/password-reset', (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'არასწორი მონაცემები ან პაროლი ძალიან მოკლეა' });
  }

  db.get(
    'SELECT user_id FROM reset_tokens WHERE token = ? AND expires > DATETIME("now") AND used = 0',
    [token],
    (err, row) => {
      if (err) {
        console.error('Reset verification error:', err);
        return res.status(500).json({ error: 'სერვერის შეცდომა' });
      }

      if (!row) {
        return res.status(400).json({ error: 'არასწორი ან ვადაგასული ტოკენი' });
      }

      const hash = bcrypt.hashSync(newPassword, 12);
      
      db.serialize(() => {
        // Update password
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, row.user_id]);
        
        // Mark token as used
        db.run('UPDATE reset_tokens SET used = 1 WHERE token = ?', [token]);
      });

      res.json({ message: 'პაროლი წარმატებით შეცვლილია' });
    }
  );
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Serve reset page
app.get('/reset', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).send('<h1>არასწორი მისამართი</h1><p>ტოკენი არ მოიძებნა</p>');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ka">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>პაროლის აღდგენა - IMEDCalc</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        </style>
    </head>
    <body class="min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
            <div class="text-center mb-8">
                <h1 class="text-2xl font-bold text-gray-800 mb-2">პაროლის აღდგენა</h1>
                <p class="text-gray-600">შეიყვანეთ ახალი პაროლი</p>
            </div>
            
            <form id="reset-form" class="space-y-4">
                <input type="hidden" name="token" value="${token}">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">ახალი პაროლი</label>
                    <input 
                        type="password" 
                        name="newPassword" 
                        required 
                        minlength="8"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="მინიმუმ 8 სიმბოლო"
                    >
                </div>
                <button 
                    type="submit"
                    class="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-2 px-4 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition duration-200"
                >
                    პაროლის შეცვლა
                </button>
            </form>
            
            <div id="message" class="mt-4 p-3 rounded-lg hidden"></div>
            
            <div class="mt-6 text-center">
                <a href="/" class="text-blue-600 hover:text-blue-800 text-sm">← უკან მთავარ გვერდზე</a>
            </div>

            <script>
                document.getElementById('reset-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const data = Object.fromEntries(formData);
                    const messageEl = document.getElementById('message');
                    const submitBtn = e.target.querySelector('button[type="submit"]');
                    
                    try {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'მუშავდება...';
                        messageEl.className = 'mt-4 p-3 rounded-lg bg-green-100 border-l-4 border-green-500 text-green-700';
                        messageEl.textContent = 'მუშავდება...';
                        messageEl.classList.remove('hidden');
                        
                        const response = await fetch('/api/password-reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(data)
                        });
                        
                        const result = await response.json();
                        
                        if (response.ok) {
                            messageEl.textContent = 'პაროლი წარმატებით შეცვლილია!';
                            setTimeout(() => {
                                window.location.href = '/';
                            }, 2000);
                        } else {
                            throw new Error(result.error || 'უცნობი შეცდომა');
                        }
                    } catch (error) {
                        messageEl.className = 'mt-4 p-3 rounded-lg bg-red-100 border-l-4 border-red-500 text-red-700';
                        messageEl.textContent = error.message;
                        messageEl.classList.remove('hidden');
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'პაროლის შეცვლა';
                    }
                });
            </script>
        </div>
    </body>
    </html>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'ფაილი ძალიან დიდია (მაქს. 2MB)' });
    }
    return res.status(400).json({ error: 'ფაილის ატვირთვის შეცდომა' });
  }
  
  res.status(500).json({ error: 'შიდა სერვერის შეცდომა' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'გვერდი ვერ მოიძებნა' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 IMEDCalc სერვერი გაშვებულია: http://localhost:${PORT}`);
  console.log(`📊 ჯანმრთელობის შემოწმება: http://localhost:${PORT}/api/health`);
  console.log(`🗄️ მონაცემთა ბაზა: database.db`);
  console.log(`🔐 JWT საიდუმლო: ${JWT_SECRET.substring(0, 8)}...`);
  console.log(`\n📱 PWA მხარდაჭერილია\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 სერვერი ჩაირთვება...');
  db.close((err) => {
    if (err) {
      console.error('Database close error:', err);
    } else {
      console.log('✅ მონაცემთა ბაზა დახურულია');
    }
    process.exit(0);
  });
});

module.exports = app;