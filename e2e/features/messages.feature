Feature: Messages
  Clients and builders message each other. New messages arrive without reloading, the menu counts
  unread ones, and the sender sees when they've been read.

  Scenario: Reading a new message
    Given I am logged in as Emma
    Then the menu says "Messages" has "1 unread messages"
    When I open "Messages" in the menu
    And I open the conversation with "Reid & Sons Construction"
    Then I see "I've sent you a change order with the price."
    And the menu says "Messages" has no count
    When I switch to Marcus's browser
    And I open "Messages" in the menu
    And I open the conversation with "Emma Clarke"
    Then I see "Seen"

  Scenario: Messages arrive without reloading
    Given I am logged in as Emma
    When I open "Messages" in the menu
    And I open the conversation with "Reid & Sons Construction"
    And Marcus sends Emma the message "The skylight arrives on Tuesday."
    Then I see the message "The skylight arrives on Tuesday."

  Scenario: Sending a message with Enter, and an email for someone who's away
    Given I am logged in as Emma
    When I open "Messages" in the menu
    And I open the conversation with "Becker Roofing"
    And I type "Thanks again, Tom!" and press Enter
    Then I see the message "Thanks again, Tom!"
    And Tom gets an email "New message from Emma Clarke"

  Scenario: Builders message clients they've quoted for
    Given I am logged in as Grace
    When I open the job "Main bathroom remodel"
    And I click "Message the client"
    Then I am in the conversation with "Emma Clarke"
    When I type "Happy to come and measure on Friday." and press Enter
    Then I see the message "Happy to come and measure on Friday."

  Scenario: A builder with no conversations yet
    Given I am logged in as Grace
    When I open "Messages" in the menu
    Then I see "No conversations yet."
    And I see "Clients can message you from your profile. You can message clients once you’ve quoted for them."
