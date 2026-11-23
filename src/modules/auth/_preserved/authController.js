import Auth from './auth.model.js';

export const register = async (req, res) => {
  const { email, password } = req.body;
  const user = await Auth.create({ email, password });
  res.status(201).json(user);
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await Auth.findOne({ email });
  res.status(200).json(user);
};

export const logout = async (req, res) => {
  res.status(200).json({ message: 'Logged out' });
};

export const getUser = async (req, res) => {
  const user = await Auth.findById(req.user.id);
  res.status(200).json(user);
};
