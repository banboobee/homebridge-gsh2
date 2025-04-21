import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface UserDataResponse {
  user_id: string;
  paypalSubscriptionID: string;
  //  paypalProductID: string;
  paypalPlanID: string;
  paypalPlanName?: string;
  paypalPlanDescription?: string;
  paypalSubscribeDate: Date;
  subscriptionType: number; // 0 - None, 1 - Trial ( trialExpiryDate), 2 - Vendor Managed Subscription ( no expiry ), 3 - Manual Subscription ( subscriptionExpiryDate )
  subscriptionActive: boolean;
  expiryDate: Date;
  paypalPlans: PayPalPlanResponse[];
  paypalScript: string;
};

export interface PayPalPlanResponse {
  id: string;
  name: string;
  description: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserDataService {

  constructor(private http: HttpClient) { }

  private userData: UserDataResponse;

  private createHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  /*
  getUserData(domain: string, token: string): Observable<UserDataResponse> {
    const headers = this.createHeaders(token);
    const userUrl = `${domain}/userData/user-data`;

    const userRequest = this.http.get<{ userData: UserData }>(userUrl, { headers });

    const plansRequest = this.subscriptionPlans.length
      ? of({ plans: this.subscriptionPlans }) // use cache
      : this.http.get<{ plans: PayPalPlanResponse[] }>(`${domain}/userData/user-data?plans=true`, { headers });

    return forkJoin({ userResponse: userRequest, plansResponse: plansRequest }).pipe(
      map(({ userResponse, plansResponse }) => {
        if (!this.subscriptionPlans.length) {
          this.subscriptionPlans = plansResponse.plans;
        }

        const userData: UserDataResponse = userResponse.userData;

        return {
          ...userData,
          paypalPlanName: matchingPlan?.name || null,
          paypalPlanDetails: matchingPlan || null,
        };
      })
    );
  }
  */

  getUserData(domain: string, token: string): Observable<UserDataResponse> {

    const headers = this.createHeaders(token);
    const url = `${domain}/userData/userData`;

    return this.http.get<{ userData: UserDataResponse }>(url, { headers }).pipe(
      map(response => {
        this.userData = response.userData;
        return this.userData;
      })
    );
  }

  private scriptLoaded = false;

  loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.scriptLoaded) {
        resolve();
        return;
      }

      if (!this.userData?.paypalScript) {
        reject(new Error('PayPal script URL is not available.'));
        return;
      }
      const script = document.createElement('script');
      script.src = this.userData?.paypalScript;
      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };
      script.onerror = reject;

      document.body.appendChild(script);
    });
  }

}
