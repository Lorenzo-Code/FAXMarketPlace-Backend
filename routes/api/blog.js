import express from 'express';
import BlogPost from '../../models/BlogPost.js';

const router = express.Router();

// GET all posts
router.get('/', async (req, res) => {
  const posts = await BlogPost.find().sort({ createdAt: -1 });
  res.json(posts);
});

// GET single post by slug
router.get('/:slug', async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug });
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(post);
});

// CREATE new post (admin only)
// ✅ THIS IS THE GOOD ONE
router.post('/autosave', async (req, res) => {
  const {
    title,
    mode,
    wysiwygContent,
    codeContent,
    author = 'Admin',
    published = false,
  } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');

  try {
    let post = await BlogPost.findOne({ slug });

    if (post) {
      post.mode = mode || post.mode;
      post.wysiwygContent = wysiwygContent;
      post.codeContent = codeContent;
      post.updatedAt = new Date();
      await post.save();
      return res.json({ saved: true, updated: true });
    }

    const newPost = new BlogPost({
      title,
      slug,
      mode,
      wysiwygContent,
      codeContent,
      author,
      published,
    });

    await newPost.save();
    return res.json({ saved: true, created: true });

  } catch (err) {
    console.error('Autosave error:', err);
    return res.status(500).json({ error: 'Autosave failed' });
  }
});


// UPDATE post by ID
router.put('/:id', async (req, res) => {
  const updated = await BlogPost.findByIdAndUpdate(req.params.id, {
    ...req.body,
    updatedAt: new Date()
  }, { new: true });
  res.json(updated);
});

// DELETE post
router.delete('/:id', async (req, res) => {
  await BlogPost.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

export default router;
