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
        <div className="p-6 border-b border-[#cbd5e1]">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M7 0C3.13 0 0 3.13 0 7c0 3.87 3.13 7 7 7s7-3.13 7-7c0-3.87-3.13-7-7-7zm0 12.5c-3.03 0-5.5-2.47-5.5-5.5S3.97 1.5 7 1.5 12.5 3.97 12.5 7 10.03 12.5 7 12.5z"
                  fill="#a6192e"
                />
                <circle cx="7" cy="4" r="1" fill="#a6192e" />
                <circle cx="7" cy="10" r="1" fill="#a6192e" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-[#020617] text-xl font-normal m-0 mb-1">Talk to a Person</h3>
              <p className="text-[#64748b] text-sm font-normal m-0" style={{ lineHeight: '20px' }}>
                Please provide your contact information and someone will reach out to you shortly.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-normal text-[#020617] mb-2">
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
                className={`w-full border rounded-[10px] h-[44px] px-4 text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20 ${
                  errors.name ? 'border-red-500' : 'border-[#cbd5e1]'
                }`}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-normal text-[#020617] mb-2">
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
                className={`w-full border rounded-[10px] h-[44px] px-4 text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20 ${
                  errors.email ? 'border-red-500' : 'border-[#cbd5e1]'
                }`}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Phone Number Field */}
            <div>
              <label className="block text-sm font-normal text-[#020617] mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                placeholder="Enter your phone number"
                className="w-full border border-[#cbd5e1] rounded-[10px] h-[44px] px-4 text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
              />
            </div>

            {/* Zip Code Field */}
            <div>
              <label className="block text-sm font-normal text-[#020617] mb-2">
                Zip Code
              </label>
              <input
                type="text"
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                placeholder="Enter your zip code"
                className="w-full border border-[#cbd5e1] rounded-[10px] h-[44px] px-4 text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
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

