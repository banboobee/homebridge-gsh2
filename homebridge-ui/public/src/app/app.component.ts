import { Component, OnDestroy, OnInit } from '@angular/core';
import { JwtHelperService } from '@auth0/angular-jwt';

import { PluginConfig, PluginSchema, ServerEnvMetadata } from '@homebridge/plugin-ui-utils/dist/ui.interface';
import { SERVER_ADDRESS } from '../../../../src/settings';
import { TranslateService } from './translate.service';

import { UserDataResponse, UserDataService } from './user-data.service';

const jwtHelper = new JwtHelperService()

type AccountData = {
  user_id: string;
  paypalSubscriptionID: string;
  paypalProductID: string;
  paypalPlanID: string;
  paypalSubscribeDate: Date;
  subscriptionType: number;
  subscriptionActive: boolean;
  expiryDate: Date;
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  private linkDomain: string;
  private linkUrl: string;
  private popup: Window;
  private originCheckInterval;

  public pluginConfig: PluginConfig;
  public schema: PluginSchema;
  public env: ServerEnvMetadata['env'] = window.homebridge.serverEnv.env;

  public linkType: string;
  public user_id: string;
  public justLinked = false;

  public showAdvanced = false;
  public ready = false;

  public userData: UserDataResponse;

  constructor(
    public translateService: TranslateService,
    private userDataService: UserDataService
  ) { }

  async ngOnInit(): Promise<void> {
    this.schema = await window.homebridge.getPluginConfigSchema();
    const configBlocks = await window.homebridge.getPluginConfig();

    if (!configBlocks.length) {
      this.pluginConfig = {
        name: 'Google Smart Home',
        platform: this.schema.pluginAlias,
      };
    } else {
      this.pluginConfig = configBlocks[0];
      window.homebridge.showSchemaForm();
    }

    this.linkDomain = this.pluginConfig.betaServer
      ? `https://${SERVER_ADDRESS.beta}`
      : `https://${SERVER_ADDRESS.prod}`;
    this.linkUrl = this.linkDomain + '/link-account';

    this.parseToken();
    this.userDataService.getUserData(this.linkDomain, this.pluginConfig.token).subscribe({
      next: data => {
        this.userData = data;
        console.log('✅ User data loaded:', data);
        this.userDataService.loadScript().then(() => {
          console.log('PayPal script loaded');
        }).catch(error => console.error('PayPal script failed to load', error));
        this.renderPayPalButtons();
      },
      error: err => {
        console.log('❌ Failed to load user data:', err);
      }
    });


    this.ready = true;

    window.homebridge.addEventListener('configChanged', (event: MessageEvent) => {
      this.pluginConfig = event.data[0];
    });
  }

  async updateConfig() {
    return window.homebridge.updatePluginConfig([this.pluginConfig]);
  }

  linkAccount() {
    window.addEventListener('message', this.windowMessageListener, false);

    const w = 450;
    const h = 700;
    const y = window.top.outerHeight / 2 + window.top.screenY - (h / 2);
    const x = window.top.outerWidth / 2 + window.top.screenX - (w / 2);
    this.popup = window.open(
      this.linkUrl,
      'oznu-google-smart-home-auth',
      `toolbar=no, location=no, directories=no, status=no, menubar=no scrollbars=no, resizable=no, copyhistory=no, width=${w}, height=${h}, top=${y}, left=${x}`
    );

    this.originCheckInterval = setInterval(() => {
      this.popup.postMessage('origin-check', this.linkDomain);
    }, 2000);
  }

  async processToken(token: string) {
    clearInterval(this.originCheckInterval);
    if (this.popup) {
      this.popup.close();
    }

    this.pluginConfig.token = token;
    this.pluginConfig.notice = 'Keep your token a secret!';

    this.parseToken();
    this.justLinked = true;
    await this.updateConfig();
    await window.homebridge.savePluginConfig();
    window.homebridge.showSchemaForm();
  }

  parseToken() {
    if (this.pluginConfig.token) {
      try {
        const decoded = jwtHelper.decodeToken(this.pluginConfig.token);
        this.linkType = decoded.id.split('|')[0].split('-')[0];
        this.user_id = decoded.id;
      } catch (e) {
        window.homebridge.toast.error(
          'Invalid account linking token in config.json',
          this.translateService.translations['toast.title_error']
        );
        delete this.pluginConfig.token;
      }
    }
  }

  renderPayPalButtons(): void {
    setTimeout(() => {
      // Clear existing PayPal buttons
      this.userData.paypalPlans.forEach((_, index) => {
        const container = document.getElementById(`paypal-button-container-${index}`);
        if (container) container.innerHTML = ''; // Clear old buttons
        this.renderPayPalButton(this.userData.paypalPlans[index], index);
      });
    }, 300);
  }

  renderPayPalButton(plan: any, index: number): void {
    setTimeout(() => {
      if ((window as any).paypal?.Buttons) {
        console.log(`Rendering PayPal button for plan ${plan.id}`);
        (window as any).paypal.Buttons({
          createSubscription: (data, actions) => {
            return actions.subscription.create({
              plan_id: plan.id,
              custom_id: this.user_id,
              start_time: this.userData.expiryDate,
              application_context: {
                shipping_preference: "NO_SHIPPING" // no shipping since digital good
              },
            });
          },
          onApprove: (data, actions) => {
            console.log('✅ Subscription approved:', data);

            const body = {
              planId: plan.id,
              subscriptionID: data.subscriptionID,
              orderID: data.orderID,
              paymentSource: data.paymentSource,
              facilitatorAccessToken: data.facilitatorAccessToken,
            };

            // POST this to your backend to record the subscription
            fetch(`${this.linkDomain}/userData/subscribe`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.pluginConfig.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body)
            })
              .then(res => res.json())
              .then(response => {
                console.log('✅ Backend subscription saved:', response);
                // Optionally update UI, refresh data, etc.
              })
              .catch(err => {
                console.error('❌ Failed to store subscription in backend:', err);
              });
          },
          onError: (err) => {
            console.error(`PayPal error for ${plan.id}:`, err);
          }
        }).render(`#paypal-button-container-${index}`);
      } else {
        console.error('PayPal SDK not available.');
      }
    }, 1000);
  }

  windowMessageListener = (e: MessageEvent) => {
    if (e.origin !== this.linkDomain) return;

    try {
      const data = JSON.parse(e.data);
      if (data.token) {
        this.processToken(data.token);
      }
    } catch (e) {
      console.error(e);
    }
  }

  ngOnDestroy() {
    clearInterval(this.originCheckInterval);
    window.removeEventListener('message', this.windowMessageListener);
    if (this.popup) {
      this.popup.close();
    }
  }

  cancelSubscription() {
    this.showConfirmModal = true; // Show modal
  }

  public showConfirmModal = false;

  confirmCancel() {
    this.showConfirmModal = false;
    // Proceed with cancellation logic here
    console.log('Cancelling subscription...');
    if (!this.userData?.paypalSubscriptionID) {
      console.error('No subscription ID found');
      return;
    }
    console.log('Cancelling subscription:', this.userData.paypalSubscriptionID);

    const body = {
      subscriptionID: this.userData.paypalSubscriptionID
    }

    fetch(`${this.linkDomain}/userData/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.pluginConfig.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })
      .then(res => res.json())
      .then(response => {
        console.log('✅ Backend subscription cancelled:', response);
        // Optionally update UI, refresh data, etc.
      })
      .catch(err => {
        console.error('❌ Failed to cancel subscription in backend:', err);
      });
  }
}
