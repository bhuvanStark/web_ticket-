import React, { useState } from 'react';
import { Star, CheckCircle, ThumbsUp, Send } from 'lucide-react';

export function FeedbackModal({ ticket, onSubmitFeedback, onClose }) {
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState(['Punctual', 'Technical Knowledge']);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const tagsList = ['Punctual', 'Technical Knowledge', 'Professional', 'Clean Work', 'Clear Communication'];

  const toggleTag = (t) => {
    if (selectedTags.includes(t)) {
      setSelectedTags(selectedTags.filter(item => item !== t));
    } else {
      setSelectedTags([...selectedTags, t]);
    }
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => {
      onSubmitFeedback({ rating, tags: selectedTags, comment });
    }, 1500);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
        {!submitted ? (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              How was your service experience?
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              Rate the AV technician service for Ticket #{ticket?.id || 'TT-10482'}
            </p>

            {/* Interactive 5 Star Rating */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', transition: 'transform 150ms ease' }}
                >
                  <Star
                    size={36}
                    fill={star <= rating ? '#F59E0B' : 'none'}
                    color={star <= rating ? '#F59E0B' : 'var(--color-text-tertiary)'}
                  />
                </button>
              ))}
            </div>

            {/* Quality Tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px', marginBottom: '20px' }}>
              {tagsList.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '16px',
                      border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {isSelected ? '✓ ' : ''}{tag}
                  </button>
                );
              })}
            </div>

            {/* Comment Box */}
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add optional comments for the service desk..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                fontSize: '13px',
                marginBottom: '20px',
                outline: 'none',
                resize: 'none'
              }}
            />

            <button onClick={handleSubmit} className="btn-primary">
              <Send size={16} />
              <span>Submit Feedback</span>
            </button>
          </div>
        ) : (
          <div style={{ padding: '24px 0' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--color-success-bg)',
              color: 'var(--color-success)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px'
            }}>
              <CheckCircle size={40} />
            </div>

            <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              Thank You for Your Feedback!
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Your feedback helps TaskTel maintain high SLA quality.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
