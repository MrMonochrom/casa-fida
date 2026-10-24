Feature: Passwords
  A forgotten password can be reset from a link in an email, and a known one changed under Account.
  Either way, every other browser the person is logged in on is logged out.

  Scenario: Resetting a forgotten password
    Given I open Casa Fida
    When I ask for a link to reset the password of "emma.clarke@example.com"
    Then I see "If an account uses emma.clarke@example.com, we've sent it a link to choose a new password. It works for an hour."
    And Emma gets an email "Reset your Casa Fida password"
    When I open the link in Emma's email "Reset your Casa Fida password"
    Then I see the heading "Choose a new password"
    When I fill in "New password" with "BrandNew12345"
    And I click "Save new password"
    Then I see the heading "Hi, Emma"
    And Emma can log in with the password "BrandNew12345"
    And Emma can't log in with the password "CasaFida123"

  Scenario: No email goes to an address without an account
    Given I open Casa Fida
    When I ask for a link to reset the password of "nobody@example.com"
    Then I see "If an account uses nobody@example.com, we've sent it a link to choose a new password."
    And "nobody@example.com" gets no email "Reset your Casa Fida password"

  Scenario: A reset link works once
    Given I open Casa Fida
    And I ask for a link to reset the password of "emma.clarke@example.com"
    And I open the link in Emma's email "Reset your Casa Fida password"
    And I fill in "New password" with "BrandNew12345"
    And I click "Save new password"
    And I see the heading "Hi, Emma"
    When I open the link in Emma's email "Reset your Casa Fida password"
    And I fill in "New password" with "AnotherOne12345"
    And I click "Save new password"
    Then I see the heading "This link doesn't work any more"
    And I see "This password reset link has expired or was already used. Ask for a new one."
    When I click "Ask for a new link"
    Then I see the heading "Hi, Emma"

  Scenario: Changing the password logs out every other browser
    Given I am logged in as Emma
    And Emma is also logged in on another computer
    When I open "Account" in the menu
    And I change my password from "CasaFida123" to "BrandNew12345"
    Then I see "Password changed."
    And Emma's other computer is logged out
    And Emma can log in with the password "BrandNew12345"

  Scenario: The current password has to be right
    Given I am logged in as Emma
    When I open "Account" in the menu
    And I change my password from "not-my-password" to "BrandNew12345"
    Then I see the error "Your current password is wrong."
