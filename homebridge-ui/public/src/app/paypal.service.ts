import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PaypalService {
  private scriptLoaded = false;

  loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.scriptLoaded) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.paypal.com/sdk/js?client-id=Ac-8yxcNqDwzqaQUHLtv6DLODg9604ct6n7ncWHUxQp0yKtzetBnyBXPXqvL9qGWzOgLHlxdATM9QibT&vault=true&intent=subscription';
      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };
      script.onerror = reject;

      document.body.appendChild(script);
    });
  }

  cancelSubscription(paypalSubscriptionID: string): Promise<any> {
    return;
  }
}
