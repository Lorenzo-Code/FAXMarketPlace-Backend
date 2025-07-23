import mongoose from 'mongoose';

const BlogPostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, unique: true },
    mode: { type: String, enum: ['wysiwyg', 'code'], default: 'wysiwyg' },
    wysiwygContent: { type: String },
    codeContent: { type: String },
    author: { type: String, default: 'Admin' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    published: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },

});

export default mongoose.model('BlogPost', BlogPostSchema);
