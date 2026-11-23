import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  url: { type: String, required: true },
});

const Room = mongoose.model('Room', roomSchema);

export default Room;
