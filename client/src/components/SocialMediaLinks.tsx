import { MessageCircle, Facebook, Instagram, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openSocialApp } from '@/lib/socialAppLinks';

interface SocialMediaLinksProps {
  whatsappNumber?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function SocialMediaLinks({
  whatsappNumber = '201069035599',
  facebookUrl = 'https://facebook.com',
  instagramUrl = 'https://instagram.com',
  showLabels = true,
  size = 'md'
}: SocialMediaLinksProps) {
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  const openWhatsApp = () => {
    openSocialApp('whatsapp', whatsappNumber);
  };

  const openFacebook = () => {
    openSocialApp('facebook', facebookUrl);
  };

  const openInstagram = () => {
    openSocialApp('instagram', instagramUrl);
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'محلات أبو رغوة للمنظفات',
          text: 'تابعنا على وسائل التواصل الاجتماعي',
          url: window.location.href
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(window.location.href);
        alert('تم نسخ الرابط');
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* WhatsApp */}
      <Button
        onClick={openWhatsApp}
        className={`${sizeClasses[size]} bg-green-500 hover:bg-green-600 text-white rounded-full p-0 flex items-center justify-center transition-transform hover:scale-110`}
        title="تواصل عبر WhatsApp"
      >
        <MessageCircle className="w-5 h-5" />
      </Button>
      {showLabels && <span className="text-xs text-gray-600">WhatsApp</span>}

      {/* Facebook */}
      <Button
        onClick={openFacebook}
        className={`${sizeClasses[size]} bg-blue-600 hover:bg-blue-700 text-white rounded-full p-0 flex items-center justify-center transition-transform hover:scale-110`}
        title="تابعنا على Facebook"
      >
        <Facebook className="w-5 h-5" />
      </Button>
      {showLabels && <span className="text-xs text-gray-600">Facebook</span>}

      {/* Instagram */}
      <Button
        onClick={openInstagram}
        className={`${sizeClasses[size]} bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full p-0 flex items-center justify-center transition-transform hover:scale-110`}
        title="تابعنا على Instagram"
      >
        <Instagram className="w-5 h-5" />
      </Button>
      {showLabels && <span className="text-xs text-gray-600">Instagram</span>}

      {/* Share */}
      <Button
        onClick={handleShare}
        className={`${sizeClasses[size]} bg-gray-600 hover:bg-gray-700 text-white rounded-full p-0 flex items-center justify-center transition-transform hover:scale-110`}
        title="مشاركة"
      >
        <Share2 className="w-5 h-5" />
      </Button>
      {showLabels && <span className="text-xs text-gray-600">مشاركة</span>}
    </div>
  );
}
