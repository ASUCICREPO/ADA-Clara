'use client';

import { useState } from 'react';

interface TalkToPersonFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
}

interface FormData {
  name: string;
  email: string;
  phoneNumber: string;
  zipCode: string;
}

export default function TalkToPersonForm({ isOpen, onClose, onSubmit }: TalkToPersonFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phoneNumber: '',
    zipCode: '',
  });

  const [errors, setErrors] = useState<Partial<FormData>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Partial<FormData> = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit(formData);
    // Reset form
    setFormData({ name: '', email: '', phoneNumber: '', zipCode: '' });
    setErrors({});
  };

  const handleCancel = () => {
    setFormData({ name: '', email: '', phoneNumber: '', zipCode: '' });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[15px] shadow-lg w-full max-w-[512px] mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '24px', borderBottom: '1px solid #cbd5e1' }}>
          <div className="flex items-start" style={{ gap: '12px' }}>
            <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '28px', height: '28px' }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M17.5 14.375v2.5c0 .688-.563 1.25-1.25 1.25-5.5 0-10-4.5-10-10 0-.688.563-1.25 1.25-1.25h2.5c.688 0 1.25.563 1.25 1.25 0 1.375.219 2.719.625 3.969.125.375.063.813-.188 1.094l-1.656 1.656c2.344 3.469 5.875 6.969 9.344 9.344l1.656-1.656c.281-.25.719-.313 1.094-.188 1.25.406 2.594.625 3.969.625.688 0 1.25.563 1.25 1.25z"
                  fill="#a6192e"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-[#020617] text-xl font-normal m-0" style={{ marginBottom: '4px' }}>Talk to a Person</h3>
              <p className="text-[#64748b] text-sm font-normal m-0" style={{ lineHeight: '20px' }}>
                Please provide your contact information and someone from the American Diabetes Association will follow up with you.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-[#020617] m-0" style={{ marginBottom: '8px' }}>
                Name <span className="text-[#a6192e]">(required)</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  setErrors({ ...errors, name: undefined });
                }}
                placeholder="Enter your name"
                className={`w-full border rounded-[10px] h-[44px] text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20 ${
                  errors.name ? 'border-red-500' : 'border-[#cbd5e1]'
                }`}
                style={{ paddingLeft: '12px', paddingRight: '12px' }}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-[#020617] m-0" style={{ marginBottom: '8px' }}>
                Email <span className="text-[#a6192e]">(required)</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  setErrors({ ...errors, email: undefined });
                }}
                placeholder="Enter your email address"
                className={`w-full border rounded-[10px] h-[44px] text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20 ${
                  errors.email ? 'border-red-500' : 'border-[#cbd5e1]'
                }`}
                style={{ paddingLeft: '12px', paddingRight: '12px' }}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Phone Number Field */}
            <div>
              <label className="block text-sm font-medium text-[#020617] m-0" style={{ marginBottom: '8px' }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                placeholder="Enter your phone number"
                className="w-full border border-[#cbd5e1] rounded-[10px] h-[44px] text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
                style={{ paddingLeft: '12px', paddingRight: '12px' }}
              />
            </div>

            {/* Zip Code Field */}
            <div>
              <label className="block text-sm font-medium text-[#020617] m-0" style={{ marginBottom: '8px' }}>
                Zip Code
              </label>
              <input
                type="text"
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                placeholder="Enter your zip code"
                className="w-full border border-[#cbd5e1] rounded-[10px] h-[44px] text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
                style={{ paddingLeft: '12px', paddingRight: '12px' }}
              />
            </div>

            {/* Buttons */}
            <div className="flex" style={{ gap: '16px', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 h-[48px] border border-[#cbd5e1] rounded-[10px] text-sm font-normal text-[#020617] bg-white hover:bg-[#f8fafc] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 h-[48px] bg-[#a6192e] text-white rounded-[10px] text-sm font-normal hover:opacity-90 transition-opacity"
              >
                Submit
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

