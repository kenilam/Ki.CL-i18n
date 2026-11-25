import mongoose from 'mongoose';

export async function connect(): Promise<void> {
  await mongoose.connect(process.env.MONGODB_ATLAS_URI ?? '', {
    dbName: process.env.MONGODB_DATABASE || 'test',
    retryWrites: true,
    w: 'majority',
  });
}
