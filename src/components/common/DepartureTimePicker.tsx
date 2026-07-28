"use client";

import { useState } from 'react';
import { Clock, X } from 'lucide-react';

interface DepartureTimePickerProps {
  onTimeChange?: (timestamp: number | null) => void;
  className?: string;
}

export default function DepartureTimePicker({ onTimeChange, className = '' }: DepartureTimePickerProps) {
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeValue = e.target.value;
    setSelectedTime(timeValue);
    
    if (timeValue) {
      // HH:MM 형식을 Unix timestamp로 변환
      const [hours, minutes] = timeValue.split(':').map(Number);
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
      const timestamp = Math.floor(targetDate.getTime() / 1000);
      onTimeChange?.(timestamp);
    } else {
      onTimeChange?.(null);
    }
  };

  const handleClear = () => {
    setSelectedTime('');
    onTimeChange?.(null);
  };

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  if (!isOpen) {
    return (
      <button
        onClick={toggleOpen}
        className={`flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors ${className}`}
        title="출발 시간 설정"
      >
        <Clock className="w-4 h-4 text-zinc-600" />
        <span className="text-sm font-medium text-zinc-700">
          {selectedTime ? selectedTime : '출발 시간'}
        </span>
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 bg-zinc-100 rounded-lg p-2 ${className}`}>
      <Clock className="w-4 h-4 text-zinc-600 shrink-0" />
      <input
        type="time"
        value={selectedTime}
        onChange={handleTimeChange}
        className="flex-1 bg-transparent text-sm font-medium text-zinc-700 outline-none"
      />
      {selectedTime && (
        <button
          onClick={handleClear}
          className="p-1 hover:bg-zinc-200 rounded transition-colors"
          title="시간 초기화"
        >
          <X className="w-3.5 h-3.5 text-zinc-500" />
        </button>
      )}
      <button
        onClick={toggleOpen}
        className="p-1 hover:bg-zinc-200 rounded transition-colors"
        title="닫기"
      >
        <X className="w-3.5 h-3.5 text-zinc-500" />
      </button>
    </div>
  );
}
