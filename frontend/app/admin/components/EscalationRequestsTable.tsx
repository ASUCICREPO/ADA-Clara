'use client';

import { useState } from 'react';

interface EscalationRequest {
  name: string;
  email: string;
  phone: string;
  zipCode: string;
  dateTime: string;
}

export default function EscalationRequestsTable() {
  const [searchQuery, setSearchQuery] = useState('');

  // Sample data - replace with actual data from your API
  const data: EscalationRequest[] = [
    { name: 'Maria Rodriguez', email: 'maria.rodriguez@email.com', phone: '(555) 234-5678', zipCode: '85001', dateTime: 'Dec 21, 2:34 PM' },
    { name: 'James Smith', email: 'james.smith@email.com', phone: '(555) 987-6543', zipCode: '85002', dateTime: 'Dec 22, 10:30 AM' },
    { name: 'Sarah Johnson', email: 'sarah.johnson@email.com', phone: '-', zipCode: '85003', dateTime: 'Dec 22, 11:15 AM' },
    { name: 'Michael Brown', email: 'michael.brown@email.com', phone: '(555) 456-7890', zipCode: '-', dateTime: 'Dec 22, 1:45 PM' },
    { name: 'Emily Davis', email: 'emily.davis@email.com', phone: '(555) 321-0987', zipCode: '85005', dateTime: 'Dec 22, 3:20 PM' },
  ];

  const filteredData = data.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white border border-[#cbd5e1] rounded-[15px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]" style={{ padding: '24px' }}>
      <h2 className="text-[#a6192e] text-lg font-normal m-0" style={{ marginBottom: '16px' }}>Escalation Requests</h2>
      
      {/* Search bar */}
      <div style={{ marginBottom: '16px', position: 'relative' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or email"
          className="w-full border border-[#cbd5e1] rounded-[10px] h-[40px] px-4 pl-10 text-sm text-[#020617] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#a6192e]/20"
        />
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <path
            d="M11.3333 9.33333H10.5933L10.3267 9.07333C11.1733 8.06 11.6667 6.75333 11.6667 5.33333C11.6667 2.38667 9.28 0 6.33333 0C3.38667 0 1 2.38667 1 5.33333C1 8.28 3.38667 10.6667 6.33333 10.6667C7.75333 10.6667 9.06 10.1733 10.0733 9.32667L10.3333 9.59333V10.3333L14.3333 14.3267L15.6667 12.9933L11.3333 9.33333ZM6.33333 9.33333C4.12667 9.33333 2.33333 7.54 2.33333 5.33333C2.33333 3.12667 4.12667 1.33333 6.33333 1.33333C8.54 1.33333 10.3333 3.12667 10.3333 5.33333C10.3333 7.54 8.54 9.33333 6.33333 9.33333Z"
            fill="#94a3b8"
          />
        </svg>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th className="text-left text-xs font-medium text-[#64748b] py-2 px-2" style={{ textAlign: 'left' }}>Name</th>
              <th className="text-left text-xs font-medium text-[#64748b] py-2 px-2" style={{ textAlign: 'left' }}>Email</th>
              <th className="text-left text-xs font-medium text-[#64748b] py-2 px-2" style={{ textAlign: 'left' }}>Phone</th>
              <th className="text-left text-xs font-medium text-[#64748b] py-2 px-2" style={{ textAlign: 'left' }}>ZIP Code</th>
              <th className="text-left text-xs font-medium text-[#64748b] py-2 px-2" style={{ textAlign: 'left' }}>Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, index) => (
              <tr key={index} style={{ borderBottom: index < filteredData.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <td className="text-sm font-normal text-[#020617] py-3 px-2">{item.name}</td>
                <td className="text-sm font-normal text-[#020617] py-3 px-2">{item.email}</td>
                <td className="text-sm font-normal text-[#020617] py-3 px-2">{item.phone}</td>
                <td className="text-sm font-normal text-[#020617] py-3 px-2">{item.zipCode}</td>
                <td className="text-sm font-normal text-[#020617] py-3 px-2">{item.dateTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

