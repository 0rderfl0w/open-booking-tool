import React from 'react';
import { Practitioner } from '@/types/database';

interface EmailSignatureProps {
  practitioner: Practitioner;
}

export const EmailSignature: React.FC<EmailSignatureProps> = ({ practitioner }) => {
  return (
    <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
      <p style={{ margin: '12px 0', fontSize: '14px', fontWeight: '600' }}>
        {practitioner.display_name}
      </p>
      <p style={{ margin: '4px 0', fontSize: '14px', color: '#666' }}>
        {practitioner.email}
      </p>
      {(practitioner.website || practitioner.linkedin_url || practitioner.twitter_url) && (
        <p style={{ margin: '8px 0', fontSize: '13px', color: '#666' }}>
          {practitioner.website?.startsWith('https://') && (
            <a href={practitioner.website} style={{ color: '#0066cc', textDecoration: 'none', marginRight: '12px' }}>
              Website
            </a>
          )}
          {practitioner.linkedin_url?.startsWith('https://') && (
            <a href={practitioner.linkedin_url} style={{ color: '#0066cc', textDecoration: 'none', marginRight: '12px' }}>
              LinkedIn
            </a>
          )}
          {practitioner.twitter_url?.startsWith('https://') && (
            <a href={practitioner.twitter_url} style={{ color: '#0066cc', textDecoration: 'none' }}>
              Twitter/X
            </a>
          )}
        </p>
      )}
    </div>
  );
};
