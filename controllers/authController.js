const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

exports.register = async (req, res) => {
  console.log("Incoming registration body:", req.body);

  const { firstName, lastName, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ msg: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    const token = generateToken(newUser); // ✅ Use your wrapper

    res.status(201).json({
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role,
      },
      token, // includes role now!
    });
  } catch (err) {
    res.status(500).json({ msg: "Registration failed", error: err.message });
  }
};


exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid email or password" });

    const token = generateToken(user);

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      token, // ✅ use the previously generated token
    });

  } catch (err) {
    res.status(500).json({ msg: "Login failed", error: err.message });
  }
};
