import { randomUUID } from 'node:crypto';

import mongoose, { Schema, type Document } from 'mongoose';

export interface ILocale extends Document<string> {
  tag: string;
  prompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function isCanonical(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag)[0] === tag;
  } catch {
    return false;
  }
}

const LocaleSchema = new Schema<ILocale>(
  {
    _id: { type: String, default: () => randomUUID() },
    tag: {
      type: String,
      required: true,
      unique: true,
      validate: { validator: isCanonical, message: '{VALUE} is not a canonical BCP 47 language tag.' },
    },
    prompt: { type: String },
  },
  { collection: 'locales', timestamps: true },
);

export const Locales = mongoose.model<ILocale>('Locales', LocaleSchema);

export interface ITranslation extends Document {
  'accept-language': string;
  namespace: string;
  /** The key's path in the namespace, joined with dots: `account.signOut`. A list's items are numbered: `lines.0`. */
  field: string;
  value: string;
  /** The English the value was translated from. A row whose `source` still matches is left alone. */
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TranslationSchema = new Schema<ITranslation>(
  {
    'accept-language': { type: String, required: true },
    namespace: { type: String, required: true },
    field: { type: String, required: true },
    value: { type: String, required: true },
    source: { type: String },
  },
  { collection: 'translations', timestamps: true },
);

TranslationSchema.index({ 'accept-language': 1, namespace: 1, field: 1 }, { unique: true });

export const Translations = mongoose.model<ITranslation>('Translations', TranslationSchema);

export interface ITranslationRun extends Document {
  'accept-language': string;
  createdAt: Date;
  updatedAt: Date;
}

const TranslationRunSchema = new Schema<ITranslationRun>(
  {
    'accept-language': { type: String, required: true, unique: true },
  },
  { collection: 'translation_runs', timestamps: true },
);

export const TranslationRuns = mongoose.model<ITranslationRun>('TranslationRuns', TranslationRunSchema);
