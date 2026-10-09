import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageCircle, Facebook, Instagram, Share2, Mail, Phone } from 'lucide-react';

interface SocialMediaLink {
  platform: string;
  icon: React.ReactNode;
  color: string;
  url: string;
  label: string;
}

interface SocialMediaIntegrationProps {
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
  email?: string;
  phone?: string;
  message?: string;
}

export function SocialMediaIntegration({
  whatsapp = '+201234567890',
  facebook = 'https://facebook.com',
  instagram = 'https://instagram.com',
  email = 'info@example.com',
  phone = '+201234567890',
  message = 'مرحبا! أنا أستخدم تطبيق أبو رغوة',
}: SocialMediaIntegrationProps) {
  const socialLinks: SocialMediaLink[] = [
    {
      platform: 'WhatsApp',
      icon: <MessageCircle className="h-5 w-5" />,
      color: 'bg-green-500 hover:bg-green-600',
      url: `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`,
      label: 'WhatsApp',
    },
    {
      platform: 'Facebook',
      icon: <Facebook className="h-5 w-5" />,
      color: 'bg-blue-600 hover:bg-blue-700',
      url: facebook,
      label: 'Facebook',
    },
    {
      platform: 'Instagram',
      icon: <Instagram className="h-5 w-5" />,
      color: 'bg-pink-500 hover:bg-pink-600',
      url: instagram,
      label: 'Instagram',
    },
    {
      platform: 'Email',
      icon: <Mail className="h-5 w-5" />,
      color: 'bg-red-500 hover:bg-red-600',
      url: `mailto:${email}?subject=${encodeURIComponent('استفسار')}&body=${encodeURIComponent(message)}`,
      label: 'البريد الإلكتروني',
    },
    {
      platform: 'Phone',
      icon: <Phone className="h-5 w-5" />,
      color: 'bg-purple-500 hover:bg-purple-600',
      url: `tel:${phone}`,
      label: 'الهاتف',
    },
  ];

  const handleClick = (url: string, platform: string) => {
    try {
      window.open(url, '_blank');
    } catch (error) {
      console.error(`خطأ في فتح ${platform}:`, error);
      alert(`لم يتمكن من فتح ${platform}`);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">تواصل معنا</h3>
          <p className="text-sm text-gray-600">
            اختر طريقة التواصل المفضلة لديك
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {socialLinks.map((link) => (
            <Button
              key={link.platform}
              onClick={() => handleClick(link.url, link.label)}
              className={`${link.color} text-white flex flex-col items-center justify-center h-24 gap-2`}
            >
              {link.icon}
              <span className="text-xs text-center">{link.label}</span>
            </Button>
          ))}
        </div>

        {/* Share Button */}
        <Button
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: 'تطبيق أبو رغوة',
                text: message,
                url: window.location.href,
              }).catch(err => console.log('خطأ في المشاركة:', err));
            } else {
              alert('المشاركة غير مدعومة في متصفحك');
            }
          }}
          variant="outline"
          className="w-full"
        >
          <Share2 className="mr-2 h-4 w-4" />
          مشاركة التطبيق
        </Button>
      </div>
    </Card>
  );
}
